const R = require('ramda');
const config = require('../config');
const Transactions = require('./transactions');
const { hash } = require('../util/crytoUtil');

class Block {

  toHash() {
    return hash(this.index + this.previousHash + this.timestamp + JSON.stringify(this.transactions))
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
}

module.exports = Block;