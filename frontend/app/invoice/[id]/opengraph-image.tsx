import { ImageResponse } from 'next/og';

export const alt = 'Astera Invoice';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0b0b0d',
          color: '#ffffff',
          fontFamily: 'Helvetica, Arial, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 32,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: '#d4af37',
            marginBottom: 24,
          }}
        >
          Astera
        </div>
        <div style={{ fontSize: 72, fontWeight: 700, marginBottom: 16 }}>Invoice #{id}</div>
        <div style={{ fontSize: 28, color: '#9a9a9a' }}>
          Tokenized invoice financing on Stellar
        </div>
      </div>
    ),
    { ...size },
  );
}
