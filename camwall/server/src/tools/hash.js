import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error("usage: npm -w server run hash -- 'yourpassword'");
  process.exit(1);
}
console.log(bcrypt.hashSync(password, 10));
