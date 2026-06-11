CREATE TABLE IF NOT EXISTS bettors (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> ''),
  team text NOT NULL DEFAULT '',
  color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matches (
  id text PRIMARY KEY,
  source_id text NOT NULL UNIQUE,
  kickoff_at timestamptz NOT NULL,
  stage text NOT NULL CHECK (btrim(stage) <> ''),
  group_name text,
  home_team text NOT NULL CHECK (btrim(home_team) <> ''),
  away_team text NOT NULL CHECK (btrim(away_team) <> ''),
  venue text,
  status text NOT NULL CHECK (status IN ('scheduled', 'live', 'finished')),
  home_score integer,
  away_score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bets (
  id text PRIMARY KEY,
  bettor_id text NOT NULL REFERENCES bettors(id),
  match_id text NOT NULL REFERENCES matches(id),
  market text NOT NULL CHECK (btrim(market) <> ''),
  pick text NOT NULL CHECK (btrim(pick) <> ''),
  stake numeric(12, 2) NOT NULL CHECK (stake > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settled')),
  payout numeric(12, 2) CHECK (payout >= 0),
  is_win boolean,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (
      status = 'pending'
      AND payout IS NULL
      AND is_win IS NULL
      AND settled_at IS NULL
    )
    OR
    (
      status = 'settled'
      AND payout IS NOT NULL
      AND is_win IS NOT NULL
      AND settled_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS bettors_active_idx ON bettors (is_active);
CREATE INDEX IF NOT EXISTS matches_kickoff_at_idx ON matches (kickoff_at);
CREATE INDEX IF NOT EXISTS bets_bettor_id_idx ON bets (bettor_id);
CREATE INDEX IF NOT EXISTS bets_match_id_idx ON bets (match_id);
CREATE INDEX IF NOT EXISTS bets_status_idx ON bets (status);
CREATE INDEX IF NOT EXISTS bets_settled_at_idx ON bets (settled_at);
