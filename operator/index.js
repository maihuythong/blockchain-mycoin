const R = require('ramda');
const Wallets = require('../wallet/wallets');
const Wallet = require('../wallet/wallet');
const Transaction = require('../blockchain/transaction');
const TransactionBuilder = require('./transactionBuilder');
const Database = require('../Database/database');
const ArgumentException = require('../error/argumentException');
const config = require('../config');

const OPERATOR_FILE = 'wallets.json';
const defaultdbPath = '1';

class Operator {
  constructor(dbPath, blockchain) {
    dbPath = dbPath || defaultdbPath;
    this.db = new Database('data/' + dbPath + '/' + OPERATOR_FILE, new Wallets());

    // INFO: In this implementation the database is a file and every time data is saved it rewrites the file, probably it should be a more robust database for performance reasons
    this.wallets = this.db.read(Wallets);
    this.blockchain = blockchain;
  }

  addWallet(wallet) {
    this.wallets.push(wallet);
    this.db.write(this.wallets);
    return wallet;
  }

  createWalletFromPassword(password) {
    let newWallet = Wallet.fromPassword(password);
    return this.addWallet(newWallet);
  }

  checkWalletPassword(walletId, passwordHash) {
    let wallet = this.getWalletById(walletId);
    if (wallet == null) throw new ArgumentException(`Wallet not found with id '${walletId}'`);

    return wallet.passwordHash == passwordHash;
  }

  getWallets() {
    return this.wallets;
  }

  getWalletById(walletId) {
    return R.find((wallet) => { return wallet.id == walletId; }, this.wallets);
  }

  generateAddressForWallet(walletId) {
    let wallet = this.getWalletById(walletId);
    if (wallet == null) throw new ArgumentException(`Wallet not found with id '${walletId}'`);

    let address = wallet.generateAddress();
    this.db.write(this.wallets);
    return address;
  }

  getAddressesForWallet(walletId) {
    let wallet = this.getWalletById(walletId);
    if (wallet == null) throw new ArgumentException(`Wallet not found with id '${walletId}'`);

    let addresses = wallet.getAddresses();
    return addresses;
  }

  getBalanceForAddress(addressId) {
    let utxo = this.blockchain.getUnspentTransactionsForAddress(addressId);

    if (utxo == null || utxo.length == 0) throw new ArgumentException(`No transactions found for address '${addressId}'`);
    return R.sum(R.map(R.prop('amount'), utxo));
  }

  createTransaction(walletId, fromAddressId, toAddressId, amount, changeAddressId) {
    let utxo = this.blockchain.getUnspentTransactionsForAddress(fromAddressId);
    let wallet = this.getWalletById(walletId);

    if (wallet == null) throw new ArgumentException(`Wallet not found with id '${walletId}'`);

    let secretKey = wallet.getSecretKeyByAddress(fromAddressId);

    if (secretKey == null) throw new ArgumentException(`Secret key not found with Wallet id '${walletId}' and address '${fromAddressId}'`);

    let tx = new TransactionBuilder();
    tx.from(utxo);
    tx.to(toAddressId, amount);
    tx.change(changeAddressId || fromAddressId);
    tx.fee(config.FEE_PER_TRANSACTION);
    tx.sign(secretKey);

    return Transaction.fromJson(tx.build());
  }
}

module.exports = Operator;