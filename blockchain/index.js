const R = require('ramda');
const Block = require('./block');
const Blocks = require('./blocks');
const Database = require('../Database/database');
const config = require('../config');
const BlockException = require('../error/BlockException');
const Transactions = require('./transactions');
const TransactionException = require('../error/TransactionException');

const BC_FILE = 'blocks.json';
const TRANSACTIONS_FILE = 'transactions.json';
const defaultDBName = '1';

class Blockchain {
  constructor(dbPath) {
    dbPath = dbPath || defaultDBName;
    this.blocksDB = new Database('data/' + dbPath + '/' + BC_FILE, new Blocks());
    this.transactionsDB = new Database('data/' + dbPath + '/' + TRANSACTIONS_FILE, new Transactions());

    this.blocks = this.blocksDB.read(Blocks);
    this.transactions = this.transactionsDB.read(Transactions);

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

    // Remove transactions that are in the blockchain
    console.info('Removing transactions that are in the blockchain');
    R.forEach(this.removeBlockTransactionsFromTransactions.bind(this), this.blocks);
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

  checkBlock(newBlock, previousBlock) {
    const blockHash = newBlock.toHash();

    /**
     * Check block is the last block
     * Check previous block is correct
     * Check hash is correct
     */
    if (previousHash.index + 1 !== newBlock.index) {
      console.log(`Invalid index: expected '${previousBlock.index + 1}', but got '${newBlock.index}'`);
      throw new BlockException(`Invalid index: expected '${previousBlock.index + 1}' got '${newBlock.index}'`)
    } else if (previousBlock.hash !== newBlock.previousHash) {
      console.log(`Invalid previoushash: expected '${previousBlock.hash}' got '${newBlock.previousHash}'`);
      throw new BlockException(`Invalid previoushash: expected '${previousBlock.hash}' got '${newBlock.previousHash}'`);
    } else if (blockHash !== newBlock.hash) {
      console.log(`Invalid hash: expected '${blockHash}' got '${newBlock.hash}'`);
      throw new BlockException(`Invalid hash: expected '${blockHash}' got '${newBlock.hash}'`);
    }

    // check transaction is valid per block
    R.forEach(this.checkTransaction.bind(this), newBlock.transactions, referenceBlockchain);
    // Check if the sum of output transactions are equal the sum of input transactions + MINING_REWARD (representing the reward for the block miner)
    let sumOfInputsAmount = R.sum(R.flatten(R.map(R.compose(R.map(R.prop('amount')), R.prop('inputs'), R.prop('data')), newBlock.transactions))) + Config.MINING_REWARD;
    let sumOfOutputsAmount = R.sum(R.flatten(R.map(R.compose(R.map(R.prop('amount')), R.prop('outputs'), R.prop('data')), newBlock.transactions)));

    let isInputsAmountGreaterOrEqualThanOutputsAmount = R.gte(sumOfInputsAmount, sumOfOutputsAmount);
    if (!isInputsAmountGreaterOrEqualThanOutputsAmount) {
      console.log(`Invalid block balance: inputs sum '${sumOfInputsAmount}', outputs sum '${sumOfOutputsAmount}'`);
      throw new BlockException(`Invalid block balance: inputs sum '${sumOfInputsAmount}', outputs sum '${sumOfOutputsAmount}'`, { sumOfInputsAmount, sumOfOutputsAmount });
    }

    // Check if there is double spending
    let listOfTransactionIndexInputs = R.flatten(R.map(R.compose(R.map(R.compose(R.join('|'), R.props(['transaction', 'index']))), R.prop('inputs'), R.prop('data')), newBlock.transactions));
    let doubleSpendingList = R.filter((x) => x >= 2, R.map(R.length, R.groupBy(x => x)(listOfTransactionIndexInputs)));

    if (R.keys(doubleSpendingList).length) {
      console.log(`There are unspent output transactions being used more than once: unspent output transaction: '${R.keys(doubleSpendingList).join(', ')}'`);
      throw new BlockException(`There are unspent output transactions being used more than once: unspent output transaction: '${R.keys(doubleSpendingList).join(', ')}'`);
    }

    // Check if there is only 1 fee transaction and 1 reward transaction;
    let transactionsByType = R.countBy(R.prop('type'), newBlock.transactions);
    if (transactionsByType.fee && transactionsByType.fee > 1) {
      console.log(`Invalid fee transaction count: expected '1' got '${transactionsByType.fee}'`);
      throw new BlockException(`Invalid fee transaction count: expected '1' got '${transactionsByType.fee}'`);
    }

    if (transactionsByType.reward && transactionsByType.reward > 1) {
      console.log(`Invalid reward transaction count: expected '1' got '${transactionsByType.reward}'`);
      throw new BlockException(`Invalid reward transaction count: expected '1' got '${transactionsByType.reward}'`);
    }

    return true;
  }

  removeBlockTransactionsFromTransactions(newBlock) {
    this.transactions = R.reject((transaction) => { return R.find(R.propEq('id', transaction.id), newBlock.transactions); }, this.transactions);
    this.transactionsDB.write(this.transactions);
  }

  checkTransaction(transaction, referenceBlockchain = this.blocks) {

    transaction.check(transaction);

    // Verify if the transaction isn't already in the blockchain
    let isNotInBlockchain = R.all((block) => {
      return R.none(R.propEq('id', transaction.id), block.transactions);
    }, referenceBlockchain);

    if (!isNotInBlockchain) {
      console.log(`Transaction '${transaction.id}' is already in the blockchain`);
      throw new TransactionException(`Transaction '${transaction.id}' is already in the blockchain`, transaction);
    }

    // Verify if all input transactions are unspent in the blockchain
    let isInputTransactionsUnspent = R.all(R.equals(false), R.flatten(R.map((txInput) => {
      return R.map(
        R.pipe(
          R.prop('transactions'),
          R.map(R.pipe(
            R.path(['data', 'inputs']),
            R.contains({ transaction: txInput.transaction, index: txInput.index })
          ))
        ), referenceBlockchain);
    }, transaction.data.inputs)));

    if (!isInputTransactionsUnspent) {
      console.log(`Not all inputs are unspent for transaction '${transaction.id}'`);
      throw new TransactionException(`Not all inputs are unspent for transaction '${transaction.id}'`, transaction.data.inputs);
    }

    return true;
  }
}

module.exports = Blockchain;