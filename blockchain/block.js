const R = require('ramda');
const config = require('../config');
const { hash } = require('../util/crytoUtil');

class Block {

  toHash() {
    return hash(this.index + this.previousHash + this.timestamp)
  }

  static get genesis() {
    return Block.fromJson(config.GENESIS_BLOCK);
  }

  static fromJson(data) {
    let block = new Block();
    R.forEachObjIndexed((value, key) => {
      block[key] = value;
    }, data);

    block.hash = block.toHash();
    return block;
  }
}

module.exports = Block;