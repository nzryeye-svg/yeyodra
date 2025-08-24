import './Featured.scss';

export function Featured() {
  return (
    <section className="featured">
      <div className="featured__content">
        <div className="featured__text">
          <h2 className="featured__title">ELDEN RING NIGHTREIGN</h2>
          <p className="featured__description">
            ELDEN RING NIGHTREIGN is a standalone adventure within the ELDEN RING universe, 
            crafted to offer players a new gaming experience by reimagining the game's core design.
          </p>
        </div>
        <div className="featured__image">
          <div className="featured__placeholder">
            <span className="featured__placeholder-text">🏰</span>
          </div>
        </div>
      </div>
    </section>
  );
}
