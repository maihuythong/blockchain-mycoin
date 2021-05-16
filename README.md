### Blockchain project - Crypto coin

### Reference
#### Naive coin: 
  > Author: conradoqg
  
  > Github: https://github.com/conradoqg/naivecoin

#### Course: 
  > Author: David Joseph Katz

  > Link: https://www.udemy.com/course/build-blockchain-full-stack/

### Demo
Youtube: https://youtu.be/wAi_aOM6


```sh
# run node, default port for wallet (3001)
$ npm install
$ npm start

# Structure: $ node bin/pepecoin.js -p <other port> --name <database path> --peers http://localhost:3001
# Example run two nodes
$ node bin/pepecoin.js -p 3002 --name 2 --peers http://localhost:3001
$ node bin/pepecoin.js -p 3003 --name 3 --peers http://localhost:3001
```