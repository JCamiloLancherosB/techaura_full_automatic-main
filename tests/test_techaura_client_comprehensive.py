"""
Comprehensive Tests for TechAura Client

This module contains all tests for the TechAura USB burning client,
covering authentication, order management, burning operations, and error handling.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import json
from requests.exceptions import Timeout, ConnectionError as RequestsConnectionError
from datetime import datetime

# Import from conftest (pytest auto-discovers these)
from tests.conftest import (
    TechAuraClient,
    TechAuraClientError,
    TechAuraAuthenticationError,
    TechAuraConnectionError,
    USBOrder,
    APIResponse
)


# =============================================================================
# 1. Connection and Authentication Tests
# =============================================================================

class TestConnectionAndAuthentication:
    """Tests for connection and authentication functionality."""

    def test_client_connects_with_valid_credentials(self, base_url, api_key, mock_requests):
        """Test that client connects successfully with valid credentials."""
        # Arrange
        mock_requests.return_value.status_code = 200
        mock_requests.return_value.json.return_value = {'success': True}
        
        client = TechAuraClient(base_url=base_url, api_key=api_key)
        
        # Act
        result = client.connect()
        
        # Assert
        assert result is True
        mock_requests.assert_called_once()
        call_args = mock_requests.call_args
        assert call_args[1]['headers']['Authorization'] == f'Bearer {api_key}'

    def test_client_raises_on_invalid_api_key(self, base_url, api_key, mock_requests):
        """Test that client raises error when API key is invalid."""
        # Arrange
        mock_requests.return_value.status_code = 401
        mock_requests.return_value.json.return_value = {
            'success': False,
            'error': 'Invalid API key',
            'code': 'INVALID_API_KEY'
        }
        
        client = TechAuraClient(base_url=base_url, api_key=api_key)
        
        # Act & Assert
        with pytest.raises(TechAuraAuthenticationError) as exc_info:
            client.connect()
        
        assert exc_info.value.status_code == 401
        assert exc_info.value.error_code == 'INVALID_API_KEY'

    def test_client_raises_on_missing_api_key(self, base_url):
        """Test that client raises error when API key is missing."""
        # Act & Assert
        with pytest.raises(TechAuraAuthenticationError) as exc_info:
            TechAuraClient(base_url=base_url, api_key="")
        
        assert exc_info.value.error_code == 'MISSING_API_KEY'

    def test_client_handles_connection_timeout(self, base_url, api_key, mock_requests):
        """Test that client handles connection timeout gracefully."""
        # Arrange
        mock_requests.side_effect = Timeout("Connection timed out")
        
        client = TechAuraClient(
            base_url=base_url, 
            api_key=api_key,
            max_retries=1,
            retry_delay=0.01
        )
        
        # Act & Assert
        with pytest.raises(TechAuraConnectionError) as exc_info:
            client.connect()
        
        assert exc_info.value.error_code == 'TIMEOUT'
        assert exc_info.value.retryable is True

    def test_client_handles_server_unreachable(self, base_url, api_key, mock_requests):
        """Test that client handles unreachable server gracefully."""
        # Arrange
        mock_requests.side_effect = RequestsConnectionError("Connection refused")
        
        client = TechAuraClient(
            base_url=base_url, 
            api_key=api_key,
            max_retries=1,
            retry_delay=0.01
        )
        
        # Act & Assert
        with pytest.raises(TechAuraConnectionError) as exc_info:
            client.connect()
        
        assert exc_info.value.error_code == 'CONNECTION_ERROR'
        assert exc_info.value.retryable is True


# =============================================================================
# 2. get_pending_orders() Tests
# =============================================================================

class TestGetPendingOrders:
    """Tests for get_pending_orders functionality."""

    def test_returns_empty_list_when_no_orders(self, client, mock_requests):
        """Test that empty list is returned when no orders exist."""
        # Arrange
        mock_requests.return_value.status_code = 200
        mock_requests.return_value.json.return_value = {
            'success': True,
            'data': {
                'orders': [],
                'pagination': {'page': 1, 'per_page': 20, 'total': 0}
            }
        }
        
        # Act
        orders = client.get_pending_orders()
        
        # Assert
        assert orders == []
        assert isinstance(orders, list)

    def test_returns_list_of_usb_orders(self, client, mock_requests, sample_orders):
        """Test that list of USB orders is returned correctly."""
        # Arrange
        orders_data = [o.to_dict() for o in sample_orders]
        mock_requests.return_value.status_code = 200
        mock_requests.return_value.json.return_value = {
            'success': True,
            'data': {
                'orders': orders_data,
                'pagination': {'page': 1, 'per_page': 20, 'total': len(orders_data)}
            }
        }
        
        # Act
        orders = client.get_pending_orders()
        
        # Assert
        assert len(orders) == 3
        assert all(isinstance(o, dict) for o in orders)

    def test_parses_order_fields_correctly(self, client, mock_requests, sample_order):
        """Test that order fields are parsed correctly."""
        # Arrange
        order_dict = sample_order.to_dict()
        mock_requests.return_value.status_code = 200
        mock_requests.return_value.json.return_value = {
            'success': True,
            'data': {
                'orders': [order_dict],
                'pagination': {'page': 1, 'per_page': 20, 'total': 1}
            }
        }
        
        # Act
        orders = client.get_pending_orders()
        
        # Assert
        assert len(orders) == 1
        order = orders[0]
        assert order['order_id'] == 'order-123'
        assert order['order_number'] == 'ORD-2024-001'
        assert order['customer_name'] == 'Juan Pérez'
        assert order['customer_phone'] == '+573001234567'
        assert order['product_type'] == 'music'
        assert order['capacity'] == '16GB'
        assert order['genres'] == ['Rock', 'Pop', 'Salsa']
        assert order['artists'] == ['Queen', 'Michael Jackson', 'Joe Arroyo']
        assert order['status'] == 'pending'

    def test_handles_pagination(self, client, mock_requests, sample_orders):
        """Test that pagination is handled correctly."""
        # Arrange - Page 1
        first_page_orders = [sample_orders[0].to_dict()]
        mock_requests.return_value.status_code = 200
        mock_requests.return_value.json.return_value = {
            'success': True,
            'data': {
                'orders': first_page_orders,
                'pagination': {'page': 1, 'per_page': 1, 'total': 3, 'total_pages': 3}
            }
        }
        
        # Act
        orders_page1 = client.get_pending_orders(page=1, per_page=1)
        
        # Assert
        assert len(orders_page1) == 1
        assert orders_page1[0]['order_id'] == 'order-001'
        
        # Verify pagination params were sent
        call_args = mock_requests.call_args
        assert call_args[1]['params']['page'] == 1
        assert call_args[1]['params']['per_page'] == 1

    def test_handles_malformed_response_gracefully(self, client, mock_requests):
        """Test that malformed API response is handled gracefully."""
        # Arrange - Response missing expected fields
        mock_requests.return_value.status_code = 200
        mock_requests.return_value.json.return_value = {
            'success': True,
            'data': None  # Missing orders key
        }
        
        # Act
        orders = client.get_pending_orders()
        
        # Assert - Should return empty list instead of crashing
        assert orders == []


# =============================================================================
# 3. start_burning() Tests
# =============================================================================

class TestStartBurning:
    """Tests for start_burning functionality."""

    def test_returns_true_on_success(self, client, mock_requests):
        """Test that start_burning returns True on success."""
        # Arrange
        mock_requests.return_value.status_code = 200
        mock_requests.return_value.json.return_value = {
            'success': True,
            'message': 'Burning started successfully'
        }
        
        # Act
        result = client.start_burning('order-123')
        
        # Assert
        assert result is True
        call_args = mock_requests.call_args
        assert '/orders/order-123/start-burning' in call_args[1]['url']

    def test_returns_false_on_invalid_order(self, client, mock_requests):
        """Test that start_burning returns False for invalid order."""
        # Arrange
        mock_requests.return_value.status_code = 404
        mock_requests.return_value.content = b'{"success": false}'
        mock_requests.return_value.json.return_value = {
            'success': False,
            'error': 'Order not found',
            'code': 'ORDER_NOT_FOUND'
        }
        
        # Act & Assert
        with pytest.raises(TechAuraClientError) as exc_info:
            client.start_burning('invalid-order-id')
        
        assert exc_info.value.status_code == 404
        assert exc_info.value.error_code == 'ORDER_NOT_FOUND'

    def test_handles_already_burning_order(self, client, mock_requests):
        """Test that already burning order is handled properly."""
        # Arrange
        mock_requests.return_value.status_code = 409
        mock_requests.return_value.content = b'{"success": false}'
        mock_requests.return_value.json.return_value = {
            'success': False,
            'error': 'Order is already being burned',
            'code': 'ALREADY_BURNING'
        }
        
        # Act & Assert
        with pytest.raises(TechAuraClientError) as exc_info:
            client.start_burning('order-123')
        
        assert exc_info.value.status_code == 409
        assert exc_info.value.error_code == 'ALREADY_BURNING'

    def test_retries_on_temporary_failure(self, client, mock_requests):
        """Test that temporary failures trigger retries."""
        # Arrange - First call fails, second succeeds
        fail_response = Mock()
        fail_response.status_code = 503
        fail_response.content = b'{"success": false}'
        fail_response.json.return_value = {
            'success': False,
            'error': 'Service temporarily unavailable'
        }
        
        success_response = Mock()
        success_response.status_code = 200
        success_response.json.return_value = {'success': True}
        
        mock_requests.side_effect = [fail_response, success_response]
        
        # Act
        result = client.start_burning('order-123')
        
        # Assert
        assert result is True
        assert mock_requests.call_count == 2


# =============================================================================
# 4. complete_burning() Tests
# =============================================================================

class TestCompleteBurning:
    """Tests for complete_burning functionality."""

    def test_returns_true_on_success(self, client, mock_requests):
        """Test that complete_burning returns True on success."""
        # Arrange
        mock_requests.return_value.status_code = 200
        mock_requests.return_value.json.return_value = {
            'success': True,
            'message': 'Burning completed successfully'
        }
        
        # Act
        result = client.complete_burning('order-123')
        
        # Assert
        assert result is True
        call_args = mock_requests.call_args
        assert '/orders/order-123/complete-burning' in call_args[1]['url']

    def test_returns_false_on_not_burning_order(self, client, mock_requests):
        """Test that completing a non-burning order is handled."""
        # Arrange
        mock_requests.return_value.status_code = 400
        mock_requests.return_value.content = b'{"success": false}'
        mock_requests.return_value.json.return_value = {
            'success': False,
            'error': 'Order is not currently burning',
            'code': 'NOT_BURNING'
        }
        
        # Act & Assert
        with pytest.raises(TechAuraClientError) as exc_info:
            client.complete_burning('order-123')
        
        assert exc_info.value.status_code == 400
        assert exc_info.value.error_code == 'NOT_BURNING'

    def test_sends_notes_if_provided(self, client, mock_requests):
        """Test that notes are sent when provided."""
        # Arrange
        mock_requests.return_value.status_code = 200
        mock_requests.return_value.json.return_value = {
            'success': True,
            'message': 'Burning completed with notes'
        }
        
        test_notes = "USB burned successfully. Quality verified."
        
        # Act
        result = client.complete_burning('order-123', notes=test_notes)
        
        # Assert
        assert result is True
        call_args = mock_requests.call_args
        assert call_args[1]['json']['notes'] == test_notes


# =============================================================================
# 5. report_error() Tests
# =============================================================================

class TestReportError:
    """Tests for report_error functionality."""

    def test_returns_true_on_success(self, client, mock_requests):
        """Test that report_error returns True on success."""
        # Arrange
        mock_requests.return_value.status_code = 200
        mock_requests.return_value.json.return_value = {
            'success': True,
            'message': 'Error reported successfully'
        }
        
        # Act
        result = client.report_error('order-123', 'USB drive failed to burn')
        
        # Assert
        assert result is True
        call_args = mock_requests.call_args
        assert '/orders/order-123/report-error' in call_args[1]['url']

    def test_sends_error_code_and_retryable_flag(self, client, mock_requests):
        """Test that error_code and retryable flag are sent correctly."""
        # Arrange
        mock_requests.return_value.status_code = 200
        mock_requests.return_value.json.return_value = {'success': True}
        
        # Act
        result = client.report_error(
            order_id='order-123',
            error_message='Temporary write failure',
            error_code='WRITE_ERROR',
            retryable=True
        )
        
        # Assert
        assert result is True
        call_args = mock_requests.call_args
        request_data = call_args[1]['json']
        assert request_data['error_message'] == 'Temporary write failure'
        assert request_data['error_code'] == 'WRITE_ERROR'
        assert request_data['retryable'] is True

    def test_handles_very_long_error_messages(self, client, mock_requests):
        """Test that very long error messages are handled/truncated."""
        # Arrange
        mock_requests.return_value.status_code = 200
        mock_requests.return_value.json.return_value = {'success': True}
        
        # Create a very long error message (20000 characters)
        long_error = "A" * 20000
        
        # Act
        result = client.report_error('order-123', long_error)
        
        # Assert
        assert result is True
        call_args = mock_requests.call_args
        sent_message = call_args[1]['json']['error_message']
        # Message should be truncated
        assert len(sent_message) <= 10015  # 10000 + '...[truncated]' length
        assert sent_message.endswith('...[truncated]')


# =============================================================================
# 6. Error Handling Tests
# =============================================================================

class TestErrorHandling:
    """Tests for various error handling scenarios."""

    def test_handles_500_server_error(self, client, mock_requests):
        """Test handling of 500 Internal Server Error."""
        # Arrange
        mock_requests.return_value.status_code = 500
        mock_requests.return_value.content = b'{"success": false}'
        mock_requests.return_value.json.return_value = {
            'success': False,
            'error': 'Internal server error'
        }
        
        # Create client with single retry for faster test
        client_single_retry = TechAuraClient(
            base_url=client.base_url,
            api_key=client.api_key,
            max_retries=1,
            retry_delay=0.01
        )
        
        # Act & Assert
        with pytest.raises(TechAuraClientError) as exc_info:
            client_single_retry.get_pending_orders()
        
        assert exc_info.value.status_code == 500
        assert exc_info.value.error_code == 'SERVER_ERROR'
        assert exc_info.value.retryable is True

    def test_handles_503_service_unavailable(self, client, mock_requests):
        """Test handling of 503 Service Unavailable."""
        # Arrange
        mock_requests.return_value.status_code = 503
        mock_requests.return_value.content = b'{"success": false}'
        mock_requests.return_value.json.return_value = {
            'success': False,
            'error': 'Service unavailable'
        }
        
        # Create client with single retry for faster test
        client_single_retry = TechAuraClient(
            base_url=client.base_url,
            api_key=client.api_key,
            max_retries=1,
            retry_delay=0.01
        )
        
        # Act & Assert
        with pytest.raises(TechAuraClientError) as exc_info:
            client_single_retry.get_pending_orders()
        
        assert exc_info.value.status_code == 503
        assert exc_info.value.error_code == 'SERVICE_UNAVAILABLE'
        assert exc_info.value.retryable is True

    def test_handles_rate_limiting_429(self, client, mock_requests):
        """Test handling of 429 Rate Limited response."""
        # Arrange
        mock_requests.return_value.status_code = 429
        mock_requests.return_value.content = b'{"success": false}'
        mock_requests.return_value.json.return_value = {
            'success': False,
            'error': 'Rate limit exceeded'
        }
        
        # Create client with single retry for faster test
        client_single_retry = TechAuraClient(
            base_url=client.base_url,
            api_key=client.api_key,
            max_retries=1,
            retry_delay=0.01
        )
        
        # Act & Assert
        with pytest.raises(TechAuraClientError) as exc_info:
            client_single_retry.get_pending_orders()
        
        assert exc_info.value.status_code == 429
        assert exc_info.value.error_code == 'RATE_LIMITED'
        assert exc_info.value.retryable is True

    def test_handles_network_errors(self, client, mock_requests):
        """Test handling of network-level errors."""
        # Arrange
        mock_requests.side_effect = RequestsConnectionError("Network unreachable")
        
        # Create client with single retry for faster test
        client_single_retry = TechAuraClient(
            base_url=client.base_url,
            api_key=client.api_key,
            max_retries=1,
            retry_delay=0.01
        )
        
        # Act & Assert
        with pytest.raises(TechAuraConnectionError) as exc_info:
            client_single_retry.get_pending_orders()
        
        assert exc_info.value.error_code == 'CONNECTION_ERROR'
        assert exc_info.value.retryable is True


# =============================================================================
# Additional Edge Case Tests
# =============================================================================

class TestEdgeCases:
    """Additional edge case tests."""

    def test_client_strips_trailing_slash_from_base_url(self, api_key):
        """Test that trailing slash is stripped from base URL."""
        client = TechAuraClient(
            base_url="https://api.techaura.com/v1/",
            api_key=api_key
        )
        assert client.base_url == "https://api.techaura.com/v1"

    def test_client_uses_correct_headers(self, client, mock_requests):
        """Test that correct headers are used in requests."""
        mock_requests.return_value.status_code = 200
        mock_requests.return_value.json.return_value = {'success': True}
        
        client.connect()
        
        call_args = mock_requests.call_args
        headers = call_args[1]['headers']
        assert 'Authorization' in headers
        assert headers['Authorization'].startswith('Bearer ')
        assert headers['Content-Type'] == 'application/json'
        assert headers['Accept'] == 'application/json'

    def test_get_pending_orders_with_failed_response(self, client, mock_requests):
        """Test get_pending_orders when API returns success: false."""
        mock_requests.return_value.status_code = 200
        mock_requests.return_value.json.return_value = {
            'success': False,
            'error': 'No permission to view orders'
        }
        
        orders = client.get_pending_orders()
        assert orders == []

    def test_complete_burning_without_notes(self, client, mock_requests):
        """Test complete_burning without providing notes."""
        mock_requests.return_value.status_code = 200
        mock_requests.return_value.json.return_value = {'success': True}
        
        result = client.complete_burning('order-123')
        
        assert result is True
        call_args = mock_requests.call_args
        # Should not send json body when no notes
        assert call_args[1]['json'] is None

    def test_report_error_without_error_code(self, client, mock_requests):
        """Test report_error without providing error code."""
        mock_requests.return_value.status_code = 200
        mock_requests.return_value.json.return_value = {'success': True}
        
        result = client.report_error('order-123', 'General error occurred')
        
        assert result is True
        call_args = mock_requests.call_args
        request_data = call_args[1]['json']
        assert 'error_code' not in request_data


# =============================================================================
# Run Tests
# =============================================================================

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
