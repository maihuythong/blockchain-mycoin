const crypto = require('crypto');

const hash = (...inputs) => {
  const hash = crypto.createHash('sha256');

  hash.update(inputs.map(input => JSON.stringify(input)).sort().join(' '));

  return hash.digest('hex');
};

const randomId = (size = 64) => {
  return crypto.randomBytes(Math.floor(size / 2)).toString('hex');
}

module.exports = { hash, randomId };