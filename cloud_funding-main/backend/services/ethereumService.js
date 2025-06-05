// services/ethereumService.js
const Web3 = require('web3');
const db = require('../db'); // DB 모듈

// Geth RPC 주소 및 시스템 마스터 계정 주소 (환경 변수 등으로 관리하는 것이 좋습니다)
const GETH_RPC_URL = 'http://localhost:8545';
const SYSTEM_MASTER_ACCOUNT_ADDRESS = '0xd10e743a1657612c9db45f9902bfbcb762697811'; // server.js의 MASTER와 동일해야 함
// 이 계정은 Geth에서 항상 잠금 해제되어 있거나, 트랜잭션 발생 시 암호 입력이 가능해야 합니다.

const web3 = new Web3(GETH_RPC_URL);

/**
 * 특정 주소의 ETH 잔액을 조회합니다.
 * @param {string} address 조회할 이더리움 주소
 * @returns {Promise<string>} ETH 잔액 (ether 단위)
 */
async function getEthBalance(address) {
  if (!web3.utils.isAddress(address)) {
    throw new Error('유효하지 않은 이더리움 주소입니다.');
  }
  const wei = await web3.eth.getBalance(address);
  return web3.utils.fromWei(wei, 'ether');
}

/**
 * ETH를 전송합니다.
 * @param {string} fromAddress 보내는 사람 주소 (Geth에 잠금 해제되어 있어야 함)
 * @param {string} toAddress 받는 사람 주소
 * @param {string | number} amountEth 전송할 ETH 양 (ether 단위)
 * @param {string} [privateKey] 보내는 사람의 개인키 (선택 사항, Geth에서 계정 관리를 안 할 경우)
 * @returns {Promise<import('web3-core').TransactionReceipt>} 트랜잭션 영수증
 */
async function sendEth(fromAddress, toAddress, amountEth, privateKey = null) {
  if (!web3.utils.isAddress(fromAddress) || !web3.utils.isAddress(toAddress)) {
    throw new Error('유효하지 않은 송금/수신 이더리움 주소입니다.');
  }
  if (isNaN(parseFloat(amountEth)) || parseFloat(amountEth) <= 0) {
    throw new Error('유효하지 않은 ETH 전송량입니다.');
  }

  const valueInWei = web3.utils.toWei(String(amountEth), 'ether');
  const gasPrice = await web3.eth.getGasPrice();
  const nonce = await web3.eth.getTransactionCount(fromAddress, 'latest'); // Nonce 처리

  const txParams = {
    from: fromAddress,
    to: toAddress,
    value: valueInWei,
    gas: '21000', // 기본 ETH 전송 가스 한도
    gasPrice: gasPrice,
    nonce: nonce,
  };

  console.log(`[EthereumService] ETH 전송 시도: From ${fromAddress} To ${toAddress}, Amount ${amountEth} ETH (${valueInWei} Wei)`);

  try {
    if (privateKey) {
      // 개인키를 사용하여 직접 서명 (Geth 외부에서 계정 관리 시)
      const signedTx = await web3.eth.accounts.signTransaction(txParams, privateKey);
      const txReceipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      console.log('[EthereumService] ETH 전송 성공 (직접 서명):', txReceipt.transactionHash);
      return txReceipt;
    } else {
      // Geth 노드를 통해 서명 (Geth에 계정이 잠금 해제되어 있어야 함)
      const txReceipt = await web3.eth.sendTransaction(txParams);
      console.log('[EthereumService] ETH 전송 성공 (Geth 서명):', txReceipt.transactionHash);
      return txReceipt;
    }
  } catch (error) {
    console.error('[EthereumService] ETH 전송 실패:', error);
    // Geth 오류 메시지 분석 및 사용자 친화적 메시지 변환
    if (error.message.includes("sender account not recognized")) {
        throw new Error(`송금자 계정(${fromAddress})을 Geth 노드에서 찾을 수 없습니다. 계정을 추가하거나 확인해주세요.`);
    } else if (error.message.includes("authentication needed: password or unlock") || error.message.includes("could not unlock signer account")) {
        throw new Error(`송금자 계정(${fromAddress})이 Geth에서 잠금 해제되지 않았습니다. Geth 콘솔에서 personal.unlockAccount를 실행해주세요.`);
    } else if (error.message.includes("insufficient funds")) {
        throw new Error(`송금자 계정(${fromAddress})의 ETH 잔액이 부족합니다 (가스비 포함).`);
    } else if (error.message.includes("nonce too low")) {
        throw new Error(`트랜잭션 논스(nonce) 값이 너무 낮습니다. Geth 노드와 계정 상태를 확인해주세요.`);
    }
    throw error; // 원본 오류 다시 던지기
  }
}

module.exports = {
  web3,
  getEthBalance,
  sendEth,
  SYSTEM_MASTER_ACCOUNT_ADDRESS
};