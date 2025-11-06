export class CrossSellingService {
  static getRecommendations(userPreferences: any, currentOrder: any): any[] {
    const recommendations = [];

    // Si pide música → recomendar audífonos
    if (userPreferences.genres.length > 0 || userPreferences.artists.length > 0) {
      recommendations.push({
        product: 'Audífonos Bluetooth Premium',
        price: '$39.900',
        reason: 'Para disfrutar tu música con la mejor calidad',
        relevance: 'high',
        image: 'https://techauraz.com/audifonos.jpg'
      });
    }

    // Si pide videos/películas → recomendar cargador
    if (currentOrder.contentType === 'videos' || currentOrder.contentType === 'movies') {
      recommendations.push({
        product: 'Cargador Rápido 25W',
        price: '$29.900',
        reason: 'Para ver tus videos sin que se acabe la batería',
        relevance: 'medium',
        image: 'https://techauraz.com/cargador.jpg'
      });
    }

    // Si orden grande → recomendar soporte
    if (this.isLargeOrder(currentOrder)) {
      recommendations.push({
        product: 'Soporte Ajustable para Celular',
        price: '$19.900',
        reason: 'Perfecto para disfrutar tu contenido cómodamente',
        relevance: 'medium',
        image: 'https://techauraz.com/soporte.jpg'
      });
    }

    return recommendations;
  }

  private static isLargeOrder(order: any): boolean {
    return order.capacity === '64GB' || order.capacity === '128GB';
  }
}