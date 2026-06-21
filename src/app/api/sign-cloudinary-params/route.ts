import { v2 as cloudinary } from 'cloudinary';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { paramsToSign } = body;
    
    // Cloudinary automatically picks up CLOUDINARY_URL from the environment.
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign, 
      cloudinary.config().api_secret!
    );
    
    return NextResponse.json({ signature });
  } catch (error) {
    console.error('Signature generation error:', error);
    return NextResponse.json({ error: 'Failed to generate signature' }, { status: 500 });
  }
}
