import { useState } from 'react';
import './GameCard.scss';

export function GameCard({ game, onClick, onShowDetails }) {
  const [imageError, setImageError] = useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  const handleCardClick = () => {
    if (onShowDetails) {
      onShowDetails(game);
    } else if (onClick) {
      onClick(game);
    }
  };

  return (
    <div className="game-card" onClick={handleCardClick}>
      <div className="game-card__backdrop">
        {!imageError && game.icon_url ? (
          <img
            src={game.icon_url}
            alt={game.game_name}
            className="game-card__cover"
            onError={handleImageError}
          />
        ) : (
          <div className="game-card__cover game-card__cover--placeholder">
            <div className="game-card__placeholder-icon">🎮</div>
          </div>
        )}

        <div className="game-card__content">
          <div className="game-card__title-container">
            <h3 className="game-card__title">{game.game_name}</h3>
            <p className="game-card__app-id">AppID: {game.app_id}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
