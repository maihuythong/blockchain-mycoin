const Block = require('./block');
const Blocks = require('./blocks');
const Database = require('../Database/database');
const config = require('../config');
const BlockException = require('../error/BlockException');

const BC_FILE = 'blocks.json';
const defaultDBName = '1';

class Blockchain {
  constructor(dbPath) {
    dbPath = dbPath || defaultDBName;
    this.blocksDB = new Database('data/' + dbPath + BC_FILE, new Blocks());

    this.blocks = this.blocksDB.read(Blocks);
    console.log('read blocks')
    this.init();
  }

  // init blockchain
  init() {
    console.log(this.blocks.length);
    if (this.blocks.length == 0) {
      console.log('Blockchain empty, adding genesis block');
      this.blocks.push(Block.genesis);
      this.blocksDB.write(this.blocks);
    }
  }

  getAllBlocks() {
    return this.blocks;
  }

  getBlockByIndex(index) {
    return this.blocks.find(x => x.index === index);
  }

  getLastBlock() {
    console.log(this.blocks);
    // return this.blocks[blocks.length - 1];
  }

  getBlockByHash(hash) {
    return this.blocks.find(x => x.hash === hash);
  }

  addBlock(newBlock) {
    if (this.checkBlock(newBlock, this.getLastBlock())) {
      this.blocks.push(newBlock);
      this.blocksDB.write(this.blocks);

      console.log(`Block added: ${newBlock.hash}`);
      return newBlock;
    }
  }

  checkBlock(newBlock, previousBlock, referenceBlock = this.blocks) {
    const blockHash = newBlock.toHash();

    /**
     * Check block is the last block
     * Check previous block is correct
     * Check hash is correct
     */
    if (previousHash.index + 1 !== newBlock.index) {
      console.error(`Invalid index: expected '${previousBlock.index + 1}', but got '${newBlock.index}'`);
      throw new BlockException(`Invalid index: expected '${previousBlock.index + 1}' got '${newBlock.index}'`)
    } else if (previousBlock.hash !== newBlock.previousHash) {
      console.error(`Invalid previoushash: expected '${previousBlock.hash}' got '${newBlock.previousHash}'`);
      throw new BlockException(`Invalid previoushash: expected '${previousBlock.hash}' got '${newBlock.previousHash}'`);
    } else if (blockHash !== newBlock.hash) {
      console.error(`Invalid hash: expected '${blockHash}' got '${newBlock.hash}'`);
      throw new BlockException(`Invalid hash: expected '${blockHash}' got '${newBlock.hash}'`);
    }

    return true;
  }
}

module.exports = Blockchain;