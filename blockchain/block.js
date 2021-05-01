const R = require('ramda');
const config = require('../config');
const Transactions = require('./transactions');
const { hash } = require('../util/crytoUtil');

class Block {

  toHash() {
    return hash(this.index + this.previousHash + this.timestamp + JSON.stringify(this.transactions) + this.nonce)
  }

  static get genesis() {
    return Block.fromJson(config.GENESIS_BLOCK);
  }

  static fromJson(data) {
    let block = new Block();
    R.forEachObjIndexed((value, key) => {
      if (key == 'transactions' && value) {
        block[key] = Transactions.fromJson(value);
      } else {
        block[key] = value;
      }
    }, data);

    block.hash = block.toHash();
    return block;
  }

  getDifficulty() {
    // 14 is the maximum precision length supported by javascript
    return parseInt(this.hash.substring(0, 14), 16);
  }
}

module.exports = Block;