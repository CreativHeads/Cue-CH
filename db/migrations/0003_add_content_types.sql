-- Add creative_reel and presentation_video to content_type enum
alter type content_type add value if not exists 'creative_reel';
alter type content_type add value if not exists 'presentation_video';

