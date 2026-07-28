'use client';

import { useState } from 'react';
import { TrancheClass, TranchePool, TrancheConfig } from '@/../sdk/src/generated/tranche';

interface TrancheCardProps {
  token: string;
  trancheClass: TrancheClass;
  pool: TranchePool;
  targetApy: number;
  trailingApy: number;
  onDeposit: (amount: number) => void;
}

function TrancheCard({
  token,
  trancheClass,
  pool,
  targetApy,
  trailingApy,
  onDeposit,
}: TrancheCardProps) {
  const isSenior = trancheClass === TrancheClass.Senior;
  const config = pool.config;

  const accounting = isSenior ? pool.senior : pool.junior;
  const deposited = Number(accounting.deposited) / 1e7; // Assuming 7 decimals
  const available = Number(accounting.available) / 1e7;
  const deployed = Number(accounting.deployed) / 1e7;
  const earned = Number(accounting.earned) / 1e7;
  const losses = Number(accounting.losses) / 1e7;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isSenior ? 'Senior' : 'Junior'} Tranche
          </h2>
          <p className="text-sm text-gray-500">{token}</p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            isSenior ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
          }`}
        >
          {isSenior ? 'Lower Risk' : 'Higher Risk'}
        </span>
      </div>

      {/* APY Comparison */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <p className="text-sm text-gray-500">Target APY</p>
          <p className="text-2xl font-semibold text-gray-900">{targetApy.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Trailing APY</p>
          <p
            className={`text-2xl font-semibold ${
              trailingApy >= targetApy ? 'text-green-600' : 'text-orange-600'
            }`}
          >
            {trailingApy.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Pool Statistics */}
      <div className="space-y-3 mb-6">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Total Deposited</span>
          <span className="font-medium">${deposited.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Available to Fund</span>
          <span className="font-medium">${available.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Deployed in Invoices</span>
          <span className="font-medium">${deployed.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Total Earned</span>
          <span className="font-medium text-green-600">${earned.toLocaleString()}</span>
        </div>
        {losses > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Losses Absorbed</span>
            <span className="font-medium text-red-600">${losses.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Risk Metrics */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Risk Metrics</h3>
        {isSenior ? (
          <div className="space-y-1 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Advance Rate Cap</span>
              <span>{(config.senior_advance_rate_bps / 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Junior Buffer</span>
              <span>${(Number(pool.junior.deposited) / 1e7).toLocaleString()}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>First Loss Position</span>
              <span>{(config.junior_first_loss_bps / 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Residual Upside</span>
              <span>Unlimited</span>
            </div>
          </div>
        )}
      </div>

      {/* Deposit Button */}
      <button
        onClick={() => onDeposit(0)}
        disabled={available === 0}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {available === 0 ? 'No Capacity' : 'Deposit to ' + (isSenior ? 'Senior' : 'Junior')}
      </button>
    </div>
  );
}

function RiskExplainer() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-blue-900 mb-3">Understanding Tranche Risk</h3>
      <div className="space-y-4 text-sm text-blue-800">
        <div>
          <h4 className="font-medium mb-1">Senior Tranche (Lower Risk)</h4>
          <p className="text-blue-700">
            Senior investors receive priority repayment with a capped return. Your principal is
            protected by junior capital that absorbs losses first. You earn a fixed target yield but
            don&apos;t participate in excess upside.
          </p>
        </div>
        <div>
          <h4 className="font-medium mb-1">Junior Tranche (Higher Risk)</h4>
          <p className="text-blue-700">
            Junior investors absorb losses first, protecting senior capital. In exchange, you
            receive all residual returns after senior obligations are met. Potential for higher
            returns, but higher risk of loss.
          </p>
        </div>
        <div>
          <h4 className="font-medium mb-1">Waterfall Repayment</h4>
          <p className="text-blue-700">
            When invoices are repaid, funds flow first to senior investors up to their capped
            return. Any remaining funds flow to junior investors. In defaults, junior capital
            absorbs losses before senior investors are affected.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function TranchesPage() {
  const [selectedToken, setSelectedToken] = useState('USDC');
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [selectedTranche, setSelectedTranche] = useState<TrancheClass | null>(null);

  // Mock data - in production, this would come from the indexer/contract
  const mockPool: TranchePool = {
    senior: {
      deposited: 8000000000n, // $8,000
      available: 2400000000n, // $2,400
      deployed: 5600000000n, // $5,600
      earned: 450000000n, // $450
      losses: 0n,
    },
    junior: {
      deposited: 2000000000n, // $2,000
      available: 600000000n, // $600
      deployed: 1400000000n, // $1,400
      earned: 280000000n, // $280
      losses: 150000000n, // $150
    },
    config: {
      senior_target_yield_bps: 1000, // 10%
      senior_advance_rate_bps: 8000, // 80%
      junior_first_loss_bps: 10000, // 100%
    },
  };

  const handleDeposit = (tranche: TrancheClass) => {
    setSelectedTranche(tranche);
    setShowDepositModal(true);
  };

  const confirmDeposit = () => {
    // In production, this would call the SDK to execute the deposit
    console.log(
      `Depositing ${depositAmount} to ${selectedTranche === TrancheClass.Senior ? 'Senior' : 'Junior'}`,
    );
    setShowDepositModal(false);
    setDepositAmount(0);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Tranche Investments</h1>
          <p className="mt-2 text-gray-600">
            Choose your risk profile with senior and junior tranches
          </p>
        </div>

        {/* Token Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Token</label>
          <select
            value={selectedToken}
            onChange={(e) => setSelectedToken(e.target.value)}
            className="block w-full max-w-xs rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="USDC">USDC</option>
            <option value="USDT">USDT</option>
            <option value="EURC">EURC</option>
          </select>
        </div>

        {/* Risk Explainer */}
        <div className="mb-8">
          <RiskExplainer />
        </div>

        {/* Tranche Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <TrancheCard
            token={selectedToken}
            trancheClass={TrancheClass.Senior}
            pool={mockPool}
            targetApy={10.0}
            trailingApy={9.8}
            onDeposit={() => handleDeposit(TrancheClass.Senior)}
          />
          <TrancheCard
            token={selectedToken}
            trancheClass={TrancheClass.Junior}
            pool={mockPool}
            targetApy={0} // Junior has no target, earns residual
            trailingApy={14.2}
            onDeposit={() => handleDeposit(TrancheClass.Junior)}
          />
        </div>

        {/* Deposit Modal */}
        {showDepositModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold mb-4">
                Deposit to {selectedTranche === TrancheClass.Senior ? 'Senior' : 'Junior'} Tranche
              </h2>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount ({selectedToken})
                </label>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(Number(e.target.value))}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Enter amount"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={confirmDeposit}
                  disabled={depositAmount <= 0}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Confirm Deposit
                </button>
                <button
                  onClick={() => setShowDepositModal(false)}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg font-medium hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
