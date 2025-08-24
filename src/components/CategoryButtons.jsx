import { useState } from 'react';
import { FaFire, FaPoll, FaTrophy, FaRandom } from 'react-icons/fa';
import './CategoryButtons.scss';

export function CategoryButtons({ activeCategory, onCategoryChange }) {
  const categories = [
    { key: 'hot', label: 'Hot now', icon: <FaFire /> },
    { key: 'top', label: 'Top games of the week', icon: <FaPoll /> },
    { key: 'beat', label: 'Games to beat', icon: <FaTrophy /> },
  ];

  return (
    <div className="category-buttons">
      <div className="category-buttons__main">
        {categories.map((category) => (
          <button
            key={category.key}
            className={`category-buttons__button ${
              activeCategory === category.key ? 'category-buttons__button--active' : ''
            }`}
            onClick={() => onCategoryChange(category.key)}
          >
            <span className="category-buttons__icon">
              {category.icon}
            </span>
            {category.label}
          </button>
        ))}
      </div>
      
      <button className="category-buttons__surprise">
        <span className="category-buttons__icon"><FaRandom /></span>
        Surprise me
      </button>
    </div>
  );
}
