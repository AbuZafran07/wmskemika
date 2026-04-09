-- Move first card to approval_delivery (stock out already done)
UPDATE delivery_requests
SET board_status = 'approval_delivery', moved_at = now(), updated_at = now()
WHERE id = '68991c12-2508-4fde-b708-ca6886779d24';

-- Archive duplicate card
UPDATE delivery_requests
SET board_status = 'archived', moved_at = now(), updated_at = now()
WHERE id = 'a6a2a3e3-6c7a-4076-9f94-362875504edb';