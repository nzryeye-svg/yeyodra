import './Featured.scss';

export function Featured({ featuredGame, isLoading, onGameClick }) {
  const handleClick = () => {
    if (featuredGame && onGameClick) {
      onGameClick(featuredGame);
    }
  };

  return (
    <section className="featured">
      <div 
        className={`featured__content ${featuredGame ? 'featured__content--clickable' : ''}`}
        onClick={handleClick}
      >
        {/* Background Image */}
        {!isLoading && featuredGame?.icon_url && (
          <div className="featured__background">
            <img 
              src={featuredGame.icon_url} 
              alt={featuredGame.game_name}
              className="featured__background-image"
            />
            <div className="featured__overlay"></div>
          </div>
        )}
        
        {/* Text Content (overlaid on image) */}
        <div className="featured__text">
          <h2 className="featured__title">
            {isLoading ? 'Loading...' : (featuredGame?.game_name || 'ELDEN RING NIGHTREIGN')}
          </h2>
          <p className="featured__description">
            {isLoading ? 'Loading game details...' : (
              featuredGame?.short_description || 
              'ELDEN RING NIGHTREIGN is a standalone adventure within the ELDEN RING universe, crafted to offer players a new gaming experience by reimagining the game\'s core design.'
            )}
          </p>
        </div>
        
        {/* Loading/Placeholder State */}
        {(isLoading || !featuredGame?.icon_url) && (
          <div className="featured__placeholder">
            <span className="featured__placeholder-text">
              {isLoading ? '⏳' : '🏰'}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
