import { parseCapacitySelection, CatalogItem } from '../utils/textUtils';

export class OrderValidator {
  // Standard catalog for validation
  private static readonly STANDARD_CATALOG: CatalogItem[] = [
    { capacity_gb: 8, price: 59900, description: '8GB - ~1,400 canciones' },
    { capacity_gb: 16, price: 69900, description: '16GB - ~2,800 canciones' },
    { capacity_gb: 32, price: 89900, description: '32GB - ~5,600 canciones' },
    { capacity_gb: 64, price: 129900, description: '64GB - ~11,200 canciones' },
    { capacity_gb: 128, price: 169900, description: '128GB - ~22,400 canciones' }
  ];

  /**
   * Validate and parse capacity from user input
   * @param input - User input text
   * @param catalog - Optional catalog (uses standard if not provided)
   * @returns Validated capacity in GB or null
   */
  static parseAndValidateCapacity(input: string, catalog?: CatalogItem[]): number | null {
    const catalogToUse = catalog || this.STANDARD_CATALOG;
    return parseCapacitySelection(input, catalogToUse);
  }

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