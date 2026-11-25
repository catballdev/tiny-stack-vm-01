import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OP = Buffer.from('gJHBhIaKi48AAAAAAAAAAImJiYmJiYmFiYmJhYmJiQCJiYkAAAAAAAAAAAAAAAAAoKSkoIAAAAAAAAAAAAAAAIWIAAAAAAAAAAAAAAAAAACEhIGE', 'base64');

function runVM(code, input) {
  const n = code.length, stack = new Int32Array(256), callStack = new Int32Array(64), mem = new Int32Array(256), outBuf = new Uint8Array(65536);
  let sp = 0, csp = 0, outPos = 0, inPos = 0, pc = 0, steps = 0;
  const halt = (c) => ({ stdout: outBuf.subarray(0, outPos), exitCode: c });

  while (true) {
    if (steps === 1000000) return halt(10);
    if (pc < 0 || pc >= n) return halt(9);
    const spec = OP[code[pc]];
    if (!spec) return halt(5);
    const m = (spec >> 4) & 7, p = (spec >> 2) & 3, u = spec & 3;
    if (pc + m >= n) return halt(9);

    steps++;
    const next = pc + 1 + m;
    if (sp < p) return halt(2);
    if (sp - p + u > 256) return halt(3);
    const op = code[pc];
    pc = next;
    const top = stack[sp - 1], second = stack[sp - 2];

    switch (op) {
      case 0x00: return halt(0);
      case 0x01: stack[sp++] = (code[next - 1] << 24) >> 24; break;
      case 0x02: stack[sp++] = code[next - 4] | (code[next - 3] << 8) | (code[next - 2] << 16) | (code[next - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04:
      case 0x06: stack[sp++] = op === 4 ? top : second; break;
      case 0x05: stack[sp - 1] = second; stack[sp - 2] = top; break;
      case 0x07: { const t = stack[sp - 3]; stack[sp - 3] = second; stack[sp - 2] = top; stack[sp - 1] = t; break; }
      case 0x10:
      case 0x11:
      case 0x12:
        stack[--sp - 1] = op === 0x10 ? (second + top) | 0 : op === 0x11 ? (second - top) | 0 : Math.imul(second, top);
        break;
      case 0x13:
      case 0x14:
      case 0x15:
      case 0x16: {
        if (!top) return halt(4);
        const u1 = second >>> 0, u2 = top >>> 0;
        stack[--sp - 1] = op === 0x13 ? (second / top) | 0
          : op === 0x14 ? (second % top) | 0
          : op === 0x15 ? Math.floor(u1 / u2) | 0
          : (u1 % u2) | 0;
        break;
      }
      case 0x17:
      case 0x1b:
        stack[sp - 1] = op === 0x17 ? (-top) | 0 : ~top;
        break;
      case 0x18:
      case 0x19:
      case 0x1a:
        stack[--sp - 1] = op === 0x18 ? second & top : op === 0x19 ? second | top : second ^ top;
        break;
      case 0x1c:
      case 0x1d:
      case 0x1e: {
        const sh = top & 31;
        stack[--sp - 1] = op === 0x1c ? second << sh : op === 0x1d ? second >> sh : (second >>> sh) | 0;
        break;
      }
      case 0x20:
      case 0x21:
      case 0x22:
        stack[--sp - 1] = (op === 0x20 ? second === top : op === 0x21 ? second < top : (second >>> 0) < (top >>> 0)) ? 1 : 0;
        break;
      case 0x30:
      case 0x31:
      case 0x32: {
        const off = ((code[next - 2] | (code[next - 1] << 8)) << 16) >> 16;
        if (op === 0x30 || (op === 0x31 ? stack[--sp] === 0 : stack[--sp] !== 0)) pc = next + off;
        break;
      }
      case 0x33:
        if (csp >= 64) return halt(7);
        callStack[csp++] = next;
        pc = code[next - 2] | (code[next - 1] << 8);
        break;
      case 0x34:
        if (csp === 0) return halt(8);
        pc = callStack[--csp];
        break;
      case 0x40:
      case 0x41: {
        if (top < 0 || top >= 256) return halt(6);
        if (op === 0x40) stack[sp - 1] = mem[top];
        else { mem[top] = second; sp -= 2; }
        break;
      }
      case 0x50: {
        const s = String(top);
        if (outPos + s.length > 65536) return halt(11);
        sp--;
        for (let i = 0; i < s.length; i++) outBuf[outPos++] = s.charCodeAt(i);
        break;
      }
      case 0x51:
        if (outPos + 1 > 65536) return halt(11);
        outBuf[outPos++] = stack[--sp] & 255;
        break;
      case 0x52: stack[sp++] = inPos < input.length ? input[inPos++] : -1; break;
      case 0x53: return halt(stack[--sp] & 255);
    }
  }
}

const inDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

for (const id of readdirSync(inDir).sort()) {
  const res = runVM(readFileSync(join(inDir, id, 'program.bin')), readFileSync(join(inDir, id, 'input.bin')));
  const dir = join(outDir, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'stdout.bin'), res.stdout);
  writeFileSync(join(dir, 'exit.txt'), `${res.exitCode}\n`);
}
