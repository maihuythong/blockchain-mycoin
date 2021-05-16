const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const R = require('ramda');
const Block = require('../blockchain/block');
const Transaction = require('../blockchain/transaction');
const TransactionException = require('../error/TransactionException');
const BlockException = require('../error/BlockException');
const HTTPError = require('../error/httpError');
const ArgumentException = require('../error/ArgumentException');
const { hash } = require('../util/crytoUtil');
const timeago = require('timeago.js');
const cors = require('cors');

class HttpServer {
  constructor(node, blockchain, operator, miner) {
    this.app = express();
    this.app.use(cors());

    const projectWallet = (wallet) => {
      return {
        id: wallet.id,
        addresses: R.map((keyPair) => {
          return keyPair.publicKey;
        }, wallet.keyPairs)
      };
    };

    this.app.use(bodyParser.json());

    // this.app.set('view engine', 'pug');
    // this.app.set('views', path.join(__dirname, 'views'));

    this.app.locals.formatters = {
      time: (rawTime) => {
        const timeInMS = new Date(rawTime * 1000);
        return `${timeInMS.toLocaleString()} - ${timeago().format(timeInMS)}`;
      },
      hash: (hashString) => {
        return hashString != '0' ? `${hashString.substr(0, 5)}...${hashString.substr(hashString.length - 5, 5)}` : '<empty>';
      },
      amount: (amount) => amount.toLocaleString()
    };

    this.app.get('/blockchain/blocks', (req, res) => {
      res.status(200).send(blockchain.getAllBlocks());
    });

    this.app.get('/blockchain/blocks/latest', (req, res) => {
      let lastBlock = blockchain.getLastBlock();
      if (lastBlock == null) throw new HTTPError(404, 'Last block not found');

      res.status(200).send(lastBlock);
    });

    this.app.put('/blockchain/blocks/latest', (req, res) => {
      let requestBlock = Block.fromJson(req.body);
      let result = node.checkReceivedBlock(requestBlock);

      if (result == null) res.status(200).send('Requesting the blockchain to check.');
      else if (result) res.status(200).send(requestBlock);
      else throw new HTTPError(409, 'Blockchain is update.');
    });

    this.app.get('/blockchain/blocks/:hash([a-zA-Z0-9]{64})', (req, res) => {
      let blockFound = blockchain.getBlockByHash(req.params.hash);
      if (blockFound == null) throw new HTTPError(404, `Block not found with hash '${req.params.hash}'`);

      res.status(200).send(blockFound);
    });

    this.app.get('/blockchain/blocks/:index', (req, res) => {
      let blockFound = blockchain.getBlockByIndex(parseInt(req.params.index));
      if (blockFound == null) throw new HTTPError(404, `Block not found with index '${req.params.index}'`);

      res.status(200).send(blockFound);
    });

    this.app.get('/blockchain/blocks/transactions/:transactionId([a-zA-Z0-9]{64})', (req, res) => {
      let transactionFromBlock = blockchain.getTransactionFromBlocks(req.params.transactionId);
      if (transactionFromBlock == null) throw new HTTPError(404, `Transaction '${req.params.transactionId}' not found in any block`);

      res.status(200).send(transactionFromBlock);
    });

    this.app.get('/blockchain/transactions', (req, res) => {
      res.status(200).send(blockchain.getAllTransactions());
    });

    this.app.post('/blockchain/transactions', (req, res) => {
      let requestTransaction = Transaction.fromJson(req.body);
      let transactionFound = blockchain.getTransactionById(requestTransaction.id);

      if (transactionFound != null) throw new HTTPError(409, `Transaction '${requestTransaction.id}' already exists`);

      try {
        let newTransaction = blockchain.addTransaction(requestTransaction);
        res.status(201).send(newTransaction);
      } catch (ex) {
        if (ex instanceof TransactionException) res.status(400).json({ message: ex.message });
        else throw ex;
      }
    });

    this.app.get('/blockchain/transactions/unspent', (req, res) => {
      res.status(200).send(blockchain.getUnspentTransactionsForAddress(req.query.address));
    });

    this.app.get('/operator/wallets', (req, res) => {
      let wallets = operator.getWallets();

      let projectedWallets = R.map(projectWallet, wallets);

      res.status(200).send(projectedWallets);
    });

    this.app.post('/operator/wallets', (req, res) => {
      let password = req.body.password;
      if (password.length <= 6) throw new HTTPError(400, 'Password must contain more than 6 characters');

      let newWallet = operator.createWalletFromPassword(password);

      let projectedWallet = projectWallet(newWallet);

      res.status(201).send(projectedWallet);
    });

    this.app.get('/operator/wallets/:walletId', (req, res) => {
      let walletFound = operator.getWalletById(req.params.walletId);
      if (walletFound == null) throw new HTTPError(404, `Wallet not found with id '${req.params.walletId}'`);

      let projectedWallet = projectWallet(walletFound);

      res.status(200).send(projectedWallet);
    });

    this.app.post('/operator/wallet/login', (req, res) => {
      let passwordHash = hash(req.body.password);
      let isValid = operator.checkWalletPassword(req.body.walletId, passwordHash);
      if (!isValid) res.status(401).json({ message: "Incorrect password!" });
      res.status(201).json({ message: "OK" });
    });

    this.app.post('/operator/wallets/:walletId/transactions', (req, res) => {
      let walletId = req.params.walletId;
      let password = req.body.password;

      if (password == null) throw new HTTPError(401, 'Wallet\'s password is missing.');
      let passwordHash = hash(password);

      try {
        if (!operator.checkWalletPassword(walletId, passwordHash)) {
          res.status(202).json({ status: 202, message: `Invalid password for wallet '${walletId}'` });
          return res;
        }

        console.log('still');
        let newTransaction = operator.createTransaction(walletId, req.body.fromAddress, req.body.toAddress, req.body.amount, req.body['changeAddress'] || req.body.fromAddress);

        newTransaction.check();

        let transactionCreated = blockchain.addTransaction(Transaction.fromJson(newTransaction));
        res.status(201).send(transactionCreated);
      } catch (ex) {
        if (ex instanceof ArgumentException || ex instanceof TransactionException) {
          if (ex instanceof ArgumentException) {
            res.status(200).send({ status: 202, message: ex.message });
          }
        }
        else throw ex;
      }
    });

    this.app.get('/operator/wallets/:walletId/address', (req, res) => {
      let walletId = req.params.walletId;
      try {
        let addresses = operator.getAddressesForWallet(walletId);
        res.status(200).send(addresses);
      } catch (ex) {
        if (ex instanceof ArgumentException) throw new HTTPError(400, ex.message, walletId, ex);
        else throw ex;
      }
    });

    this.app.post('/operator/wallets/:walletId/address', (req, res) => {
      let walletId = req.params.walletId;
      let password = req.body.password;

      if (password == null) throw new HTTPError(401, 'Wallet\'s password is missing.');
      let passwordHash = hash(password);

      try {
        if (!operator.checkWalletPassword(walletId, passwordHash)) throw new HTTPError(403, `Invalid password for wallet '${walletId}'`);
        let addresses = operator.getAddressesForWallet(walletId);
        if (addresses.length >= 1) throw new HTTPError(400, `${walletId} was existed address`);
        let newAddress = operator.generateAddressForWallet(walletId);
        res.status(201).send({ address: newAddress });
      } catch (ex) {
        if (ex instanceof ArgumentException) throw new HTTPError(400, ex.message, walletId, ex);
        else throw ex;
      }
    });

    this.app.get('/operator/:addressId/balance', (req, res) => {
      let addressId = req.params.addressId;

      try {
        let balance = operator.getBalanceForAddress(addressId);
        res.status(200).send({ balance: balance });
      } catch (ex) {
        if (ex instanceof ArgumentException) throw new HTTPError(404, ex.message, { addressId }, ex);
        else throw ex;
      }
    });

    this.app.get('/node/peers', (req, res) => {
      res.status(200).send(node.peers);
    });

    this.app.post('/node/peers', (req, res) => {
      let newPeer = node.connectToPeer(req.body);
      res.status(201).send(newPeer);
    });

    this.app.get('/node/transactions/:transactionId([a-zA-Z0-9]{64})/confirmations', (req, res) => {
      node.getConfirmations(req.params.transactionId)
        .then((confirmations) => {
          res.status(200).send({ confirmations: confirmations });
        });
    });

    // disable api when use for wallet
    this.app.post('/miner/mine', (req, res, next) => {
      miner.mine(req.body.rewardAddress, req.body['feeAddress'] || req.body.rewardAddress)
        .then((newBlock) => {
          newBlock = Block.fromJson(newBlock);
          blockchain.addBlock(newBlock);
          res.status(201).send(newBlock);
        })
        .catch((ex) => {
          if (ex instanceof BlockException && ex.message.includes('Invalid index')) next(new HTTPError(409, 'A new block were added before we were able to mine one'), null, ex);
          else next(ex);
        });
    });

    this.app.use(function (err, req, res, next) {
      if (err instanceof HTTPError) res.status(err.status);
      else res.status(500);
      res.send(err.message + (err.cause ? ' - ' + err.cause.message : ''));
    });
  }

  listen(host, port) {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, host, (err) => {
        if (err) reject(err);
        resolve(this);
      });
    });
  }

  stop() {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        console.info('Closing http');
        resolve(this);
      });
    });
  }
}

module.exports = HttpServer;