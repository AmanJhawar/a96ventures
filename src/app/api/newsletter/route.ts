import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // TODO: Integrate with your newsletter service (e.g., Mailchimp, Resend, ConvertKit)
    console.log('Newsletter subscription received for:', email)

    // Simulate network delay for testing the loading state
    await new Promise((resolve) => setTimeout(resolve, 500))

    return NextResponse.json(
      { message: 'Successfully subscribed' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Newsletter subscription error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
