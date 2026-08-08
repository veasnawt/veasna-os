export function OceanBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -top-40 left-1/4 h-[500px] w-[500px] rounded-full bg-primary/10 blur-[140px]" />
      <div className="absolute top-1/2 -right-20 h-[450px] w-[450px] rounded-full bg-forest/10 blur-[140px]" />
      <div className="absolute -bottom-32 left-1/3 h-[400px] w-[400px] rounded-full bg-gold/[0.06] blur-[140px]" />
    </div>
  );
}
