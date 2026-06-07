import fs from 'fs';
import path from 'path';

export class RunLogger {
  constructor(runDir) {
    this.runDir = runDir;
    this.logPath = path.join(runDir, 'events.jsonl');
    this.textPath = path.join(runDir, 'run.log');
    fs.mkdirSync(runDir, { recursive: true });
  }

  write(event) {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
    fs.appendFileSync(this.logPath, line, 'utf8');
    const text = `[${event.stage || 'info'}] ${event.message || event.type || 'event'}`;
    fs.appendFileSync(this.textPath, text + '\n', 'utf8');
  }

  attachConsole() {
    return (stage, message, details) => {
      const payload = { stage, message, details };
      this.write(payload);
      console.log(`[${stage}] ${message}`);
      if (details && Object.keys(details).length) {
        console.log(JSON.stringify(details, null, 2));
      }
    };
  }
}
