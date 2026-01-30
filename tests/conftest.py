"""
Pytest fixtures for TechAura Client tests.

This module provides reusable fixtures for mocking HTTP requests
and configuring the TechAura client for testing.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import json
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from datetime import datetime


# =============================================================================
# Data Classes for Test Models
# =============================================================================

@dataclass
class USBOrder:
    """Represents a USB burning order."""
    order_id: str
    order_number: str
    customer_name: str
    customer_phone: str
    product_type: str  # 'music', 'videos', 'movies'
    capacity: str
    genres: List[str]
    artists: List[str]
    videos: Optional[List[str]] = None
    movies: Optional[List[str]] = None
    status: str = 'pending'
    created_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert order to dictionary format."""
        result = {
            'order_id': self.order_id,
            'order_number': self.order_number,
            'customer_name': self.customer_name,
            'customer_phone': self.customer_phone,
            'product_type': self.product_type,
            'capacity': self.capacity,
            'genres': self.genres,
            'artists': self.artists,
            'status': self.status,
        }
        if self.videos:
            result['videos'] = self.videos
        if self.movies:
            result['movies'] = self.movies
        if self.created_at:
            result['created_at'] = self.created_at.isoformat()
        return result


@dataclass
class APIResponse:
    """Standard API response structure."""
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert response to dictionary format."""
        result = {
            'success': self.success,
            'timestamp': datetime.utcnow().isoformat()
        }
        if self.data is not None:
            result['data'] = self.data
        if self.error is not None:
            result['error'] = self.error
        if self.message is not None:
            result['message'] = self.message
        return result


# =============================================================================
# TechAura Client Implementation for Testing
# =============================================================================

class TechAuraClientError(Exception):
    """Base exception for TechAura client errors."""
    def __init__(self, message: str, status_code: Optional[int] = None, 
                 error_code: Optional[str] = None, retryable: bool = False):
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code
        self.retryable = retryable


class TechAuraAuthenticationError(TechAuraClientError):
    """Raised when authentication fails."""
    pass


class TechAuraConnectionError(TechAuraClientError):
    """Raised when connection fails."""
    pass


class TechAuraClient:
    """
    Client for interacting with the TechAura USB burning service API.
    
    This client provides methods for:
    - Retrieving pending USB orders
    - Starting/completing burning processes
    - Reporting errors
    """

    def __init__(self, base_url: str, api_key: str, timeout: int = 30,
                 max_retries: int = 3, retry_delay: float = 1.0):
        """
        Initialize the TechAura client.
        
        Args:
            base_url: The base URL of the TechAura API
            api_key: API key for authentication
            timeout: Request timeout in seconds
            max_retries: Maximum number of retry attempts
            retry_delay: Base delay between retries in seconds
        """
        if not api_key:
            raise TechAuraAuthenticationError("API key is required", 
                                              error_code="MISSING_API_KEY")
        
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self._session = None

    def _get_headers(self) -> Dict[str, str]:
        """Get headers for API requests."""
        return {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }

    def _make_request(self, method: str, endpoint: str, 
                      data: Optional[Dict] = None,
                      params: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Make an HTTP request with retry logic.
        
        This method is designed to be mocked in tests.
        """
        import requests
        from requests.exceptions import Timeout, ConnectionError as RequestsConnectionError
        
        url = f"{self.base_url}{endpoint}"
        last_error = None
        
        for attempt in range(self.max_retries):
            try:
                response = requests.request(
                    method=method,
                    url=url,
                    headers=self._get_headers(),
                    json=data,
                    params=params,
                    timeout=self.timeout
                )
                
                # Handle different status codes
                if response.status_code == 401:
                    raise TechAuraAuthenticationError(
                        "Invalid API key",
                        status_code=401,
                        error_code="INVALID_API_KEY"
                    )
                elif response.status_code == 429:
                    raise TechAuraClientError(
                        "Rate limit exceeded",
                        status_code=429,
                        error_code="RATE_LIMITED",
                        retryable=True
                    )
                elif response.status_code == 500:
                    raise TechAuraClientError(
                        "Internal server error",
                        status_code=500,
                        error_code="SERVER_ERROR",
                        retryable=True
                    )
                elif response.status_code == 503:
                    raise TechAuraClientError(
                        "Service unavailable",
                        status_code=503,
                        error_code="SERVICE_UNAVAILABLE",
                        retryable=True
                    )
                elif response.status_code >= 400:
                    error_data = response.json() if response.content else {}
                    raise TechAuraClientError(
                        error_data.get('error', f'HTTP {response.status_code}'),
                        status_code=response.status_code,
                        error_code=error_data.get('code')
                    )
                
                return response.json()
                
            except Timeout:
                last_error = TechAuraConnectionError(
                    "Connection timed out",
                    error_code="TIMEOUT",
                    retryable=True
                )
            except RequestsConnectionError:
                last_error = TechAuraConnectionError(
                    "Could not connect to server",
                    error_code="CONNECTION_ERROR",
                    retryable=True
                )
            except TechAuraClientError as e:
                if not e.retryable or attempt >= self.max_retries - 1:
                    raise
                last_error = e
            
            # Exponential backoff for retries
            if attempt < self.max_retries - 1:
                import time
                time.sleep(self.retry_delay * (2 ** attempt))
        
        if last_error:
            raise last_error
        raise TechAuraClientError("Request failed after all retries")

    def connect(self) -> bool:
        """
        Test connection to the API.
        
        Returns:
            True if connection is successful
            
        Raises:
            TechAuraConnectionError: If connection fails
            TechAuraAuthenticationError: If authentication fails
        """
        response = self._make_request('GET', '/health')
        return response.get('success', False)

    def get_pending_orders(self, page: int = 1, 
                           per_page: int = 20) -> List[Dict[str, Any]]:
        """
        Get list of pending USB orders.
        
        Args:
            page: Page number for pagination
            per_page: Number of results per page
            
        Returns:
            List of pending order dictionaries
        """
        response = self._make_request(
            'GET', 
            '/orders/pending',
            params={'page': page, 'per_page': per_page}
        )
        
        if not response.get('success'):
            return []
        
        data = response.get('data')
        if data is None:
            return []
        
        return data.get('orders', [])

    def start_burning(self, order_id: str) -> bool:
        """
        Mark an order as burning started.
        
        Args:
            order_id: The ID of the order to start burning
            
        Returns:
            True if successfully started
        """
        response = self._make_request(
            'POST',
            f'/orders/{order_id}/start-burning'
        )
        return response.get('success', False)

    def complete_burning(self, order_id: str, 
                         notes: Optional[str] = None) -> bool:
        """
        Mark an order as burning completed.
        
        Args:
            order_id: The ID of the order to complete
            notes: Optional notes about the completed order
            
        Returns:
            True if successfully completed
        """
        data = None
        if notes:
            data = {'notes': notes}
            
        response = self._make_request(
            'POST',
            f'/orders/{order_id}/complete-burning',
            data=data
        )
        return response.get('success', False)

    def report_error(self, order_id: str, error_message: str,
                     error_code: Optional[str] = None,
                     retryable: bool = False) -> bool:
        """
        Report an error for an order.
        
        Args:
            order_id: The ID of the order
            error_message: Description of the error
            error_code: Optional error code
            retryable: Whether the operation can be retried
            
        Returns:
            True if error was reported successfully
        """
        # Truncate very long error messages
        max_length = 10000
        if len(error_message) > max_length:
            error_message = error_message[:max_length] + '...[truncated]'
        
        data = {
            'error_message': error_message,
            'retryable': retryable
        }
        if error_code:
            data['error_code'] = error_code
            
        response = self._make_request(
            'POST',
            f'/orders/{order_id}/report-error',
            data=data
        )
        return response.get('success', False)


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def api_key():
    """Provide a valid test API key."""
    return "test-api-key-12345"


@pytest.fixture
def base_url():
    """Provide the base URL for the API."""
    return "https://api.techaura.com/v1"


@pytest.fixture
def client(base_url, api_key):
    """Create a TechAura client instance."""
    return TechAuraClient(
        base_url=base_url,
        api_key=api_key,
        timeout=30,
        max_retries=3,
        retry_delay=0.01  # Fast retries for testing
    )


@pytest.fixture
def mock_requests():
    """
    Provide a mock for the requests library.
    
    Usage:
        def test_something(mock_requests):
            mock_requests.return_value.status_code = 200
            mock_requests.return_value.json.return_value = {'success': True}
    """
    with patch('requests.request') as mock:
        mock.return_value = Mock()
        mock.return_value.status_code = 200
        mock.return_value.content = b'{}'
        mock.return_value.json.return_value = {'success': True}
        yield mock


@pytest.fixture
def sample_order():
    """Provide a sample USB order for testing."""
    return USBOrder(
        order_id="order-123",
        order_number="ORD-2024-001",
        customer_name="Juan Pérez",
        customer_phone="+573001234567",
        product_type="music",
        capacity="16GB",
        genres=["Rock", "Pop", "Salsa"],
        artists=["Queen", "Michael Jackson", "Joe Arroyo"],
        status="pending",
        created_at=datetime(2024, 1, 15, 10, 30, 0)
    )


@pytest.fixture
def sample_orders():
    """Provide a list of sample orders for testing."""
    return [
        USBOrder(
            order_id="order-001",
            order_number="ORD-2024-001",
            customer_name="María García",
            customer_phone="+573002345678",
            product_type="music",
            capacity="32GB",
            genres=["Salsa", "Cumbia"],
            artists=["Oscar D'León", "Los Van Van"],
            status="pending"
        ),
        USBOrder(
            order_id="order-002",
            order_number="ORD-2024-002",
            customer_name="Carlos López",
            customer_phone="+573003456789",
            product_type="videos",
            capacity="64GB",
            genres=["Pop", "Rock"],
            artists=["U2", "Coldplay"],
            videos=["video1.mp4", "video2.mp4"],
            status="pending"
        ),
        USBOrder(
            order_id="order-003",
            order_number="ORD-2024-003",
            customer_name="Ana Rodríguez",
            customer_phone="+573004567890",
            product_type="movies",
            capacity="128GB",
            genres=["Action", "Comedy"],
            artists=[],
            movies=["movie1.mp4", "movie2.mp4"],
            status="pending"
        )
    ]


@pytest.fixture
def mock_success_response():
    """Create a mock successful API response."""
    def _create_response(data: Any = None, message: str = None):
        response = Mock()
        response.status_code = 200
        response.content = b'{"success": true}'
        response.json.return_value = {
            'success': True,
            'data': data,
            'message': message,
            'timestamp': datetime.utcnow().isoformat()
        }
        return response
    return _create_response


@pytest.fixture
def mock_error_response():
    """Create a mock error API response."""
    def _create_response(status_code: int, error: str, 
                         code: str = None):
        response = Mock()
        response.status_code = status_code
        response.content = json.dumps({
            'success': False,
            'error': error,
            'code': code
        }).encode()
        response.json.return_value = {
            'success': False,
            'error': error,
            'code': code,
            'timestamp': datetime.utcnow().isoformat()
        }
        return response
    return _create_response


@pytest.fixture
def mock_paginated_response(sample_orders):
    """Create a mock paginated response for orders."""
    def _create_response(page: int = 1, per_page: int = 20, 
                         total: int = None):
        orders = sample_orders
        if total is None:
            total = len(orders)
        
        start = (page - 1) * per_page
        end = start + per_page
        page_orders = [o.to_dict() for o in orders[start:end]]
        
        response = Mock()
        response.status_code = 200
        response.content = b'{"success": true}'
        response.json.return_value = {
            'success': True,
            'data': {
                'orders': page_orders,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total': total,
                    'total_pages': (total + per_page - 1) // per_page
                }
            },
            'timestamp': datetime.utcnow().isoformat()
        }
        return response
    return _create_response
