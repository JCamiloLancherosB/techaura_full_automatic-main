export class OrderValidator {
  static validateOrder(orderData: any): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validar datos obligatorios
    if (!orderData.customer?.phone) {
      errors.push('Número de teléfono requerido');
    }

    if (!orderData.preferences?.genres?.length && 
        !orderData.preferences?.artists?.length) {
      errors.push('Debe especificar al menos un género o artista');
    }

    // Validar capacidad vs contenido
    const estimatedSize = this.estimateSize(orderData.preferences);
    if (estimatedSize > this.getMaxCapacity(orderData.capacity)) {
      warnings.push(`El contenido estimado (${estimatedSize}GB) excede la capacidad seleccionada`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private static estimateSize(preferences: any): number {
    // Lógica para estimar tamaño basado en preferencias
    return preferences.genres.length * 2 + preferences.artists.length * 1.5;
  }

  private static getMaxCapacity(capacity: string): number {
    const capacities: { [key: string]: number } = {
      '8GB': 7.2,
      '32GB': 28.8,
      '64GB': 57.6,
      '128GB': 115.2
    };
    return capacities[capacity] || 0;
  }
}