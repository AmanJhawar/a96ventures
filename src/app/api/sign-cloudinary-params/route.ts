import { v2 as cloudinary } from 'cloudinary';
import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.split('Bearer ')[1]
    const decodedToken = await adminAuth.verifyIdToken(token)
    const uid = decodedToken.uid

    const adminDoc = await adminDb.collection('admins').doc(uid).get()
    if (!adminDoc.exists) {
      return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 })
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
