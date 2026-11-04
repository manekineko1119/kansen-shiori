// Googleマップの経路・検索のURLを作る（設計書 6章）。

/** 経路。origin が null なら出発地を省く（現在地）。travelmode は 'driving' | 'transit'。 */
export function mapsDirectionsUrl({ origin, lat, lng, travelmode }) {
  const params = new URLSearchParams({ api: '1' });
  if (origin !== null) params.set('origin', origin);
  params.set('destination', `${lat},${lng}`);
  params.set('travelmode', travelmode);
  return `https://www.google.com/maps/dir/?${params}`;
}

export function mapsSearchUrl({ query }) {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query })}`;
}

export function restaurantQuery(stadiumName) {
  return `${stadiumName} 周辺 飲食店`;
}
