#!/bin/bash

# Notificador Integration Test Script
# Tests the TechauraBot integration with Notificador service

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3006}"
TEST_PHONE="${TEST_PHONE:-573008602789}"
TEST_EMAIL="${TEST_EMAIL:-test@techaura.com}"
TEST_NAME="${TEST_NAME:-Test User}"

# Helper functions
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    
    echo ""
    print_info "Testing: $name"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
        print_success "Success (HTTP $http_code)"
        echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
    else
        print_error "Failed (HTTP $http_code)"
        echo "$body"
        return 1
    fi
}

# Main test suite
main() {
    print_header "Notificador Integration Test Suite"
    
    echo ""
    print_info "Base URL: $BASE_URL"
    print_info "Test Phone: $TEST_PHONE"
    print_info "Test Email: $TEST_EMAIL"
    
    # Test 1: Configuration Status
    print_header "Test 1: Configuration Status"
    test_endpoint "Get Configuration" "GET" "/api/notifications/config"
    
    # Test 2: Health Check
    print_header "Test 2: Health Check"
    test_endpoint "Check Service Health" "GET" "/api/notifications/health"
    
    # Test 3: WhatsApp Test Notification
    print_header "Test 3: WhatsApp Test Notification"
    test_endpoint "Send WhatsApp Test" "POST" "/api/notifications/test" \
        "{\"channel\":\"whatsapp\",\"phone\":\"$TEST_PHONE\",\"name\":\"$TEST_NAME\"}"
    
    # Test 4: Email Test Notification
    print_header "Test 4: Email Test Notification"
    test_endpoint "Send Email Test" "POST" "/api/notifications/test" \
        "{\"channel\":\"email\",\"email\":\"$TEST_EMAIL\",\"name\":\"$TEST_NAME\"}"
    
    # Test 5: SMS Test Notification
    print_header "Test 5: SMS Test Notification"
    test_endpoint "Send SMS Test" "POST" "/api/notifications/test" \
        "{\"channel\":\"sms\",\"phone\":\"$TEST_PHONE\",\"name\":\"$TEST_NAME\"}"
    
    # Test 6: Get Templates
    print_header "Test 6: Get Templates"
    test_endpoint "List Templates" "GET" "/api/notifications/templates"
    
    # Test 7: Get History
    print_header "Test 7: Get Notification History"
    test_endpoint "Get History" "GET" "/api/notifications/history?limit=5"
    
    # Test 8: Get History with Filters
    print_header "Test 8: Get Filtered History"
    test_endpoint "Get WhatsApp History" "GET" "/api/notifications/history?limit=5&channel=whatsapp"
    
    # Summary
    print_header "Test Suite Complete"
    print_success "All tests executed successfully!"
    
    echo ""
    print_info "Next steps:"
    echo "  1. Check the notification history in the admin panel: $BASE_URL/notifications/"
    echo "  2. Verify notifications were sent to $TEST_PHONE and $TEST_EMAIL"
    echo "  3. Review logs for any errors or warnings"
}

# Run tests
main "$@"
