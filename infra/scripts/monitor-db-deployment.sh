#!/bin/bash
# Monitor RDS database deployment progress

echo "🔍 Monitoring MosaicDatabaseStack deployment..."
echo "This will check status every 30 seconds. Press Ctrl+C to stop."
echo ""

while true; do
  clear
  echo "=== Database Stack Status ($(date)) ==="
  echo ""
  
  # Get stack status
  STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name MosaicDatabaseStack \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")
  
  echo "📊 Stack Status: $STACK_STATUS"
  echo ""
  
  # Show recent events
  echo "📋 Recent Events:"
  aws cloudformation describe-stack-events \
    --stack-name MosaicDatabaseStack \
    --max-items 8 \
    --query 'StackEvents[*].[Timestamp,ResourceStatus,LogicalResourceId]' \
    --output table 2>/dev/null || echo "Stack not found"
  
  # Check if complete
  if [[ "$STACK_STATUS" == "CREATE_COMPLETE" ]]; then
    echo ""
    echo "✅ Stack deployment complete!"
    echo ""
    echo "Run this to get connection info:"
    echo "  just db-info"
    break
  elif [[ "$STACK_STATUS" == *"FAILED"* ]] || [[ "$STACK_STATUS" == "ROLLBACK_COMPLETE" ]]; then
    echo ""
    echo "❌ Stack deployment failed. Check errors above."
    break
  fi
  
  sleep 30
done
