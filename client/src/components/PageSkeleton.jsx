import './PageSkeleton.css';

function Shimmer({ className, style }) {
  return <span className={`sk ${className || ''}`.trim()} style={style} aria-hidden="true" />;
}

function Hero() {
  return (
    <div className="ps-hero">
      <Shimmer className="sk-line ps-hero__kicker" />
      <Shimmer className="sk-block ps-hero__title" />
      <Shimmer className="sk-line ps-hero__sub" />
      <Shimmer className="sk-line ps-hero__sub ps-hero__sub--short" />
    </div>
  );
}

function Section() {
  return (
    <div className="ps-section">
      <Shimmer className="sk-line ps-section__head" />
      <Shimmer className="sk-line" />
      <Shimmer className="sk-line ps-section__line--60" />
      <Shimmer className="sk-line ps-section__line--40" />
    </div>
  );
}

function CardGrid({ n = 3 }) {
  return (
    <div className="ps-grid">
      {Array.from({ length: n }).map((_, i) => (
        <div className="ps-card" key={i}>
          <Shimmer className="sk-line ps-card__value" />
          <Shimmer className="sk-line ps-card__label" />
        </div>
      ))}
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div className="ps">
      <Hero />
      <Section />
      <CardGrid n={3} />
      <Section />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="ps ps--dashboard">
      <Hero />
      <CardGrid n={3} />
      <div className="ps-row">
        <Shimmer className="sk-block ps-big" />
        <Shimmer className="sk-block ps-big" />
      </div>
      <Section />
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="ps ps--profile">
      <div className="ps-profile-head">
        <Shimmer className="sk-circle ps-avatar" />
        <div className="ps-profile-meta">
          <Shimmer className="sk-block ps-name" />
          <Shimmer className="sk-line ps-kicker" />
        </div>
      </div>
      <Section />
      <div className="ps-timeline">
        <Shimmer className="sk-block ps-tl-row" />
        <Shimmer className="sk-block ps-tl-row" />
        <Shimmer className="sk-block ps-tl-row" />
      </div>
      <Section />
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div className="ps ps--admin">
      <div className="ps-admin-nav">
        {Array.from({ length: 4 }).map((_, i) => (
          <Shimmer className="sk-block ps-admin-tab" key={i} />
        ))}
      </div>
      <CardGrid n={4} />
      <Section />
    </div>
  );
}

// Branded page skeleton. `variant` mirrors the target page so the layout holds
// its shape while the real content loads.
export default function PageSkeleton({ variant = 'default' }) {
  if (variant === 'dashboard') return <DashboardSkeleton />;
  if (variant === 'profile') return <ProfileSkeleton />;
  if (variant === 'admin') return <AdminSkeleton />;
  return <DefaultSkeleton />;
}