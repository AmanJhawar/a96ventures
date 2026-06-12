import Image from 'next/image'

export function Hero() {
  return (
    <section className="relative w-full h-[85vh] min-h-[600px] flex items-center justify-center overflow-hidden bg-[#0a0a0a]">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/hero-stream.png"
          alt="Abstract visual representation of market agility and strategic focus"
          fill
          priority
          className="object-cover object-center opacity-90"
          sizes="100vw"
        />
      </div>

      {/* Screen Reader Only Text (since the image contains the visual text) */}
      <div className="sr-only">
        <h1>We partner with visionaries to build tomorrow&apos;s defining companies.</h1>
      </div>
    </section>
  )
}
