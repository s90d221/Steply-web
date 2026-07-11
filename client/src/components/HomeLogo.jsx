import steplyLogo from '../assets/steply-logo.png';

export function HomeLogo() {
  return (
    <a className="foundation-brand-mark home-logo-link" href="/display/home" aria-label="Steply home">
      <img src={steplyLogo} alt="" />
    </a>
  );
}
