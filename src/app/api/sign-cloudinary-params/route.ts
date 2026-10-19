import { v2 as cloudinary } from 'cloudinary';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/firebase/admin-verify';
import { adminDb } from '@/lib/firebase/admin';
import { UserPermissions, UserRole } from '@/lib/types';
import { SUPER_ADMIN_PERMISSIONS, EMPTY_PERMISSIONS } from '@/lib/constants/permissions';

// Strictly server-controlled folder destinations
const ALLOWED_FOLDERS: Record<string, string> = {
  products: 'inventory',
  inventory: 'inventory',
  brands: 'brands',
  portfolio: 'portfolio',
  team: 'team',
};

export async function POST(request: NextRequest) {
  try {
    // 1. Cryptographically verify caller token & admin document
    const result = await verifyAdminToken(request.headers.get('Authorization'));
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status });
    }

    // 2. Retrieve caller's permissions to enforce fine-grained access
    const adminDoc = await adminDb.collection('admins').doc(result.uid).get();
    if (!adminDoc.exists) {
      return NextResponse.json({ message: 'Forbidden: Admin profile not found' }, { status: 403 });
    }

    const adminData = adminDoc.data();
    if (!adminData) {
      return NextResponse.json({ message: 'Forbidden: Admin profile is empty' }, { status: 403 });
    }

    const status = adminData.status || 'active';
    if (status === 'suspended') {
      return NextResponse.json({ message: 'Forbidden: Admin account is suspended' }, { status: 403 });
    }

    // STRICT DEFAULT DENY:
    // Missing role must NEVER default to super_admin.
    const rawRole = typeof adminData.role === 'string' ? adminData.role.trim() : '';
    if (!rawRole) {
      return NextResponse.json({ message: 'Forbidden: Admin account has no assigned role. Access denied.' }, { status: 403 });
    }

    const role = rawRole as UserRole;
    const isSuperAdmin = role === 'super_admin';

    // DEFAULT TO NO ACCESS: If permissions field is missing, default strictly to EMPTY_PERMISSIONS
    // (Only an explicit active super_admin receives SUPER_ADMIN_PERMISSIONS)
    const permissions: UserPermissions = isSuperAdmin
      ? SUPER_ADMIN_PERMISSIONS
      : (adminData.permissions || EMPTY_PERMISSIONS);

    // Optional module context from client
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional
    }

    const requestedModule = typeof body.module === 'string' ? body.module.toLowerCase() : null;

    type MediaModule = 'products' | 'brands' | 'portfolio' | 'team';

    // 3. Permission Gate: Caller must have add/edit rights for media-managing modules
    let hasUploadPermission = false;
    if (isSuperAdmin) {
      hasUploadPermission = true;
    } else if (
      requestedModule &&
      (requestedModule === 'products' ||
        requestedModule === 'inventory' ||
        requestedModule === 'brands' ||
        requestedModule === 'portfolio' ||
        requestedModule === 'team')
    ) {
      const modKey: MediaModule = requestedModule === 'inventory' ? 'products' : (requestedModule as MediaModule);
      hasUploadPermission = Boolean(
        permissions[modKey]?.add ||
        permissions[modKey]?.edit
      );
    } else {
      // If no specific module was provided, confirm the caller can edit at least one media module
      hasUploadPermission =
        Boolean(permissions.products?.add || permissions.products?.edit) ||
        Boolean(permissions.brands?.add || permissions.brands?.edit) ||
        Boolean(permissions.portfolio?.add || permissions.portfolio?.edit) ||
        Boolean(permissions.team?.add || permissions.team?.edit);
    }

    if (!hasUploadPermission) {
      return NextResponse.json(
        { message: 'Forbidden: Insufficient permissions to upload media assets' },
        { status: 403 }
      );
    }

    // 4. Server-Enforced Signing Parameters:
    // SECURITY RULE: Sign ONLY server-generated timestamp plus values the server sets.
    // NEVER spread paramsToSign or permit caller-controlled public_id, overwrite, or callbacks.
    const folder = (requestedModule && ALLOWED_FOLDERS[requestedModule]) || 'inventory';
    const timestamp = Math.round(Date.now() / 1000);
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'a96ventures';

    const serverEnforcedParams: Record<string, string | number> = {
      folder,
      timestamp,
      upload_preset: uploadPreset,
    };

    // 5. Generate signature over strictly server-enforced parameters
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
