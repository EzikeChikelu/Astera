import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { APYCalculator } from '@/components/APYCalculator';
import { usePoolConfig } from '@/lib/cache';

jest.mock('@/lib/cache', () => ({
  usePoolConfig: jest.fn(),
}));

const mockedUsePoolConfig = usePoolConfig as jest.MockedFunction<typeof usePoolConfig>;

describe('APYCalculator', () => {
  beforeEach(() => {
    mockedUsePoolConfig.mockReset();
  });

  it('renders live APY from pool config', () => {
    mockedUsePoolConfig.mockReturnValue({
      data: { yieldBps: 500 } as any,
      error: undefined,
      isLoading: false,
    } as any);

    render(<APYCalculator />);

    expect(screen.getByText(/5\.00% APY/i)).toBeInTheDocument();
  });

  it('uses fallback APY with warning when pool config loading fails', () => {
    mockedUsePoolConfig.mockReturnValue({
      data: undefined,
      error: new Error('Contract fetch failed'),
      isLoading: false,
    } as any);

    render(<APYCalculator />);

    expect(screen.getByText(/8\.00% APY/i)).toBeInTheDocument();
    expect(screen.getByText(/fallback APY/i)).toBeInTheDocument();
  });
});
