// src/data/contentExamples.ts
// Catálogo centralizado de ejemplos de contenido

export const CONTENT_EXAMPLES = {
  music: {
    genres: [
      'Reggaetón', 'Vallenato', 'Salsa', 'Cumbia', 'Merengue',
      'Bachata', 'Baladas', 'Pop Latino', 'Rock en Español',
      'Rancheras', 'Norteñas', 'Electrónica', 'Crossover',
      'Hip-Hop', 'R&B', 'Tropical', 'Boleros', 'Clásica'
    ]
  },
  videos: {
    genres: [
      'Reggaetón', 'Salsa', 'Vallenato', 'Bachata',
      'Rock', 'Pop', 'Baladas', 'Cumbia', 'Merengue',
      'Electrónica', 'Hip-Hop', 'Clásicos 80s-90s'
    ]
  },
  movies: {
    sagas: [
      { name: 'Marvel', examples: 'Avengers, Spider-Man, Iron Man' },
      { name: 'DC', examples: 'Batman, Superman, Aquaman' },
      { name: 'Star Wars', examples: 'Saga completa' },
      { name: 'Harry Potter', examples: 'Las 8 películas' },
      { name: 'Rápidos y Furiosos', examples: 'Toda la saga' },
      { name: 'El Señor de los Anillos', examples: 'Trilogía extendida' },
      { name: 'Jurassic Park', examples: 'Todas las películas' }
    ],
    series: [
      'Breaking Bad', 'Game of Thrones', 'The Office',
      'Friends', 'The Walking Dead', 'Stranger Things',
      'La Casa de Papel', 'Narcos', 'Peaky Blinders'
    ]
  },
  games: {
    platforms: {
      PS2: ['Dragon Ball Z', 'GTA San Andreas', 'FIFA', 'Resident Evil', 'God of War', 'Tekken', 'Need for Speed'],
      PS1: ['Crash Bandicoot', 'Tekken', 'Final Fantasy', 'Metal Gear Solid', 'Spyro', 'Resident Evil'],
      PSP: ['God of War', 'GTA', 'Monster Hunter', 'Tekken', 'FIFA', 'Dragon Ball Z'],
      Wii: ['Mario', 'Zelda', 'Smash Bros', 'Mario Kart', 'Wii Sports'],
      N64: ['Mario 64', 'Zelda Ocarina', 'GoldenEye', 'Mario Kart', 'Smash Bros'],
      PC: ['GTA', 'Need for Speed', 'Age of Empires', 'The Sims', 'FIFA']
    }
  }
};
