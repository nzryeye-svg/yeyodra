import './Footer.scss';

export function Footer({ downloadStatus = 'No downloads in progress', version = 'v0.1.0 "Zenith"' }) {
  return (
    <footer className="footer">
      <div className="footer__left">
        <span className="footer__status">{downloadStatus}</span>
      </div>
      <div className="footer__right">
        <span className="footer__version">{version}</span>
      </div>
    </footer>
  );
}
