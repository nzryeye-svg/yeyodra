import { useState, useRef } from 'react';
import { FaSearch, FaTimes, FaArrowLeft } from 'react-icons/fa';
import './Header.scss';

export function Header({ title, searchValue, onSearch, onSearchSubmit, showBackButton = false, onBack = null, showSearchBar = false }) {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  const focusInput = () => {
    setIsFocused(true);
    inputRef.current?.focus();
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleSearchChange = (e) => {
    if (onSearch) {
      onSearch(e.target.value);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && onSearchSubmit) {
      onSearchSubmit();
    }
  };

  const clearSearch = () => {
    if (onSearch) {
      onSearch('');
    }
    inputRef.current?.focus();
  };

  return (
    <header className="header">
      <section className="header__section header__section--left">
        {showBackButton && onBack && (
          <button className="header__back-button" onClick={onBack}>
            <FaArrowLeft />
            <span>Back</span>
          </button>
        )}
        <h3 className="header__title">{title}</h3>
      </section>

      {showSearchBar && (
        <section className="header__section">
          <div className={`header__search ${isFocused ? 'header__search--focused' : ''}`}>
            <input
              ref={inputRef}
              type="text"
              name="search"
              placeholder="Search games or AppID..."
              value={searchValue || ''}
              className="header__search-input"
              onChange={handleSearchChange}
              onFocus={() => setIsFocused(true)}
              onBlur={handleBlur}
              onKeyPress={handleKeyPress}
            />

            {searchValue && (
              <button
                type="button"
                onClick={clearSearch}
                className="header__action-button"
              >
                <FaTimes />
              </button>
            )}

            <button
              type="button"
              className="header__action-button header__search-button"
              onClick={onSearchSubmit}
              title="Search"
            >
              <FaSearch />
            </button>
          </div>
        </section>
      )}
    </header>
  );
}
