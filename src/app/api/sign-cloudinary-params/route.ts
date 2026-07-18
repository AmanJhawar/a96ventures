import { v2 as cloudinary } from 'cloudinary';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/firebase/admin-verify';

export async function POST(request: NextRequest) {
  try {
    const result = await verifyAdminToken(request.headers.get('Authorization'))
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status })
    }

    const body = await request.json();
    const { paramsToSign } = body;

    // Inject server-enforced constraints that the client CANNOT override.
    // This forces all uploads into the 'inventory' folder and enforces the preset's rules.
    const serverEnforcedParams = {
      ...paramsToSign,
      folder: 'inventory',
      upload_preset: process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'a96ventures'
    };

    // Cloudinary automatically picks up CLOUDINARY_URL from the environment.
    const signature = cloudinary.utils.api_sign_request(
      serverEnforcedParams,
      cloudinary.config().api_secret!
    );

    return NextResponse.json({ signature, enforcedParams: serverEnforcedParams });
  } catch (error) {
    console.error('Signature generation error:', error);
    return NextResponse.json({ error: 'Failed to generate signature' }, { status: 500 });
  }
}
