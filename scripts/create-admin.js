#!/usr/bin/env node
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { hashPassword, createUser, countUsers } from "../app/src/lib/auth.js";

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

function validate({ username, password }) {
  if (!/^[a-zA-Z0-9_-]{2,32}$/.test(username)) {
    return "Username must be 2–32 chars, [a-zA-Z0-9_-] only.";
  }
  if (password.length < 12) {
    return "Password must be at least 12 characters.";
  }
  return null;
}

async function main() {
  if (countUsers() > 0) {
    console.error("An admin user already exists. Use `npm run reset-password` to change the password.");
    process.exit(1);
  }

  const rl = createInterface({ input, output });
  const username = (await ask(rl, "Admin username: ")).trim();
  const password = (await ask(rl, "Password (12+ chars): ", true)).trim();
  output.write("\n");
  const confirm = (await ask(rl, "Confirm password: ", true)).trim();
  output.write("\n");
  rl.close();

  if (password !== confirm) {
    console.error("Passwords do not match. Aborting.");
    process.exit(1);
  }

  const err = validate({ username, password });
  if (err) {
    console.error(err);
    process.exit(1);
  }

  const hash = await hashPassword(password);
  const user = createUser({ username, passwordHash: hash });
  console.log(`Created admin '${user.username}' (id=${user.id}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
