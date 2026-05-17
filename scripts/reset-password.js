#!/usr/bin/env node
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { hashPassword, updatePassword, countUsers } from "../app/src/lib/auth.js";

function ask(rl, question, hide = false) {
  return new Promise((resolve) => {
    const originalWrite = rl._writeToOutput;
    if (hide) {
      rl._writeToOutput = (s) => {
        if (s === "\r\n" || s === "\n" || s === "\r") rl.output.write(s);
        else rl.output.write("");
      };
    }
    rl.question(question, (answer) => {
      rl._writeToOutput = originalWrite;
      resolve(answer);
    });
  });
}

async function main() {
  if (countUsers() === 0) {
    console.error("No admin user exists. Run `npm run create-admin` first.");
    process.exit(1);
  }

  const rl = createInterface({ input, output });
  const username = (await ask(rl, "Admin username: ")).trim();
  const password = (await ask(rl, "New password (12+ chars): ", true)).trim();
  output.write("\n");
  const confirm = (await ask(rl, "Confirm new password: ", true)).trim();
  output.write("\n");
  rl.close();

  if (password !== confirm) {
    console.error("Passwords do not match. Aborting.");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  const hash = await hashPassword(password);
  const changes = updatePassword({ username, passwordHash: hash });
  if (changes === 0) {
    console.error(`No user named '${username}' found.`);
    process.exit(1);
  }
  console.log(`Password for '${username}' updated.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
