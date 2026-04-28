import {
  rpc as StellarRpc,
  Keypair,
  TransactionBuilder,
  BASE_FEE,
  Operation,
  Contract,
  Address,
  Networks,
} from '@stellar/stellar-sdk';
import * as fs from 'fs-extra';
import * as path from 'path';

export class Deployer {
  private server: StellarRpc.Server;
  private deployerKeypair: Keypair;
  private networkPassphrase: string;

  constructor(rpcUrl: string, secretKey: string, networkPassphrase: string) {
    this.server = new StellarRpc.Server(rpcUrl);
    this.deployerKeypair = Keypair.fromSecret(secretKey);
    this.networkPassphrase = networkPassphrase;
  }

  async deploy(wasmPath: string): Promise<string> {
    const wasm = await fs.readFile(wasmPath);
    const account = await this.server.getAccount(this.deployerKeypair.publicKey());

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(Operation.invokeHostFunction({
        func: StellarRpc.xdr.HostFunction.hostFunctionTypeUploadWasm(wasm),
        auth: []
      }))
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (StellarRpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulation failed: ${sim.error}`);
    }

    const prepared = StellarRpc.assembleTransaction(tx, sim).build();
    prepared.sign(this.deployerKeypair);
    const result = await this.submitTx(prepared);

    const wasmId = StellarRpc.Api.getTransactionResponse(result).returnValue?.bytes()?.toString('hex');
    if (!wasmId) throw new Error('WASM ID not found in result');

    // Create contract instance
    const createTx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(Operation.invokeHostFunction({
        func: StellarRpc.xdr.HostFunction.hostFunctionTypeCreateContract(
          new StellarRpc.xdr.CreateContractArgs({
            contractIdPreimage: StellarRpc.xdr.ContractIdPreimage.contractIdPreimageTypeFromAddress(
              new StellarRpc.xdr.ContractIdPreimageFromAddress({
                address: new Address(this.deployerKeypair.publicKey()).toScAddress(),
                salt: Buffer.alloc(32) // In a real scenario, use a random salt
              })
            ),
            executable: StellarRpc.xdr.ContractExecutable.contractExecutableTypeWasm(
              Buffer.from(wasmId, 'hex')
            )
          })
        ),
        auth: []
      }))
      .setTimeout(30)
      .build();

    const createSim = await this.server.simulateTransaction(createTx);
    if (StellarRpc.Api.isSimulationError(createSim)) {
      throw new Error(`Create simulation failed: ${createSim.error}`);
    }

    const createPrepared = StellarRpc.assembleTransaction(createTx, createSim).build();
    createPrepared.sign(this.deployerKeypair);
    const createResult = await this.submitTx(createPrepared);

    const contractId = StellarRpc.Api.getTransactionResponse(createResult).address;
    if (!contractId) throw new Error('Contract ID not found in result');

    return contractId;
  }

  private async submitTx(tx: any): Promise<StellarRpc.Api.GetTransactionResponse> {
    const response = await this.server.sendTransaction(tx);
    if (response.status === 'ERROR') {
      throw new Error(`Transaction failed: ${JSON.stringify(response)}`);
    }

    let result = await this.server.getTransaction(response.hash);
    let attempts = 0;
    while ((result.status === 'NOT_FOUND' || result.status === 'PENDING') && attempts < 20) {
      await new Promise((r) => setTimeout(r, 1500));
      result = await this.server.getTransaction(response.hash);
      attempts++;
    }

    if (result.status === 'FAILED') {
      throw new Error('Transaction failed on-chain');
    }

    return result;
  }
}
