#!/bin/bash
# ============================================================================
# ELIO.MARKET — Database Migration Runner
# ============================================================================
# Esegue tutte le migrazioni SQL su Supabase in ordine.
#
# Uso:
#   ./run_migrations.sh <DATABASE_PASSWORD>
#
# La password del database si trova nel Supabase Dashboard:
#   Settings > Database > Connection string > Password
#
# Oppure passare direttamente la connection string completa:
#   ./run_migrations.sh --db-url "postgresql://postgres.[ref]:[password]@..."
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_REF="qgwaurdavegtyievszfd"

# Detect psql
PSQL=""
if command -v psql &>/dev/null; then
    PSQL="psql"
elif [ -f /opt/homebrew/opt/libpq/bin/psql ]; then
    PSQL="/opt/homebrew/opt/libpq/bin/psql"
else
    echo "ERRORE: psql non trovato. Installalo con: brew install libpq"
    exit 1
fi

# Parse arguments
DB_URL=""
if [ "${1:-}" = "--db-url" ] && [ -n "${2:-}" ]; then
    DB_URL="$2"
elif [ -n "${1:-}" ]; then
    DB_PASSWORD="$1"
    # Session mode pooler (port 5432) required for DDL statements
    # Try multiple regions
    REGIONS=("eu-central-1" "eu-west-1" "us-east-1" "eu-west-2" "us-east-2" "us-west-1" "ap-southeast-1" "ap-northeast-1")

    echo "Ricerca regione Supabase..."
    for region in "${REGIONS[@]}"; do
        POOLER_HOST="aws-0-${region}.pooler.supabase.com"
        TEST_URL="postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@${POOLER_HOST}:5432/postgres?sslmode=require&connect_timeout=5"
        if $PSQL "$TEST_URL" -c "SELECT 1" &>/dev/null 2>&1; then
            DB_URL="$TEST_URL"
            echo "Regione trovata: $region"
            break
        fi
    done

    # Also try direct connection
    if [ -z "$DB_URL" ]; then
        DIRECT_URL="postgresql://postgres:${DB_PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres?sslmode=require&connect_timeout=5"
        if $PSQL "$DIRECT_URL" -c "SELECT 1" &>/dev/null 2>&1; then
            DB_URL="$DIRECT_URL"
            echo "Connessione diretta trovata."
        fi
    fi

    if [ -z "$DB_URL" ]; then
        echo "ERRORE: impossibile connettersi. Verifica la password."
        echo ""
        echo "Puoi trovare la connection string completa nel Supabase Dashboard:"
        echo "  Settings > Database > Connection string"
        echo ""
        echo "Poi usa: ./run_migrations.sh --db-url \"postgresql://...\""
        exit 1
    fi
else
    echo "Uso: $0 <DATABASE_PASSWORD>"
    echo "     $0 --db-url \"postgresql://postgres.[ref]:[password]@host:port/postgres\""
    echo ""
    echo "La password si trova nel Supabase Dashboard:"
    echo "  Settings > Database > Connection string > Password"
    exit 1
fi

echo ""
echo "================================================"
echo "ELIO.MARKET — Database Migrations"
echo "================================================"
echo ""

# Test connection
echo "Test connessione..."
if ! $PSQL "$DB_URL" -c "SELECT current_database(), current_user, version();" 2>&1; then
    echo "ERRORE: connessione fallita."
    exit 1
fi
echo ""

# Migration files in order
MIGRATIONS=(
    "001_supabase_enums.sql"
    "002_supabase_tables.sql"
    "003_supabase_rls.sql"
    "004_supabase_indexes.sql"
    "005_supabase_functions.sql"
)

# Execute each migration
TOTAL=${#MIGRATIONS[@]}
PASSED=0
FAILED=0

for i in "${!MIGRATIONS[@]}"; do
    file="${MIGRATIONS[$i]}"
    filepath="${SCRIPT_DIR}/${file}"
    step=$((i + 1))

    echo "[$step/$TOTAL] Esecuzione: $file"

    if [ ! -f "$filepath" ]; then
        echo "  ERRORE: file non trovato: $filepath"
        FAILED=$((FAILED + 1))
        continue
    fi

    # Execute the SQL file
    if OUTPUT=$($PSQL "$DB_URL" -f "$filepath" 2>&1); then
        echo "  OK"
        PASSED=$((PASSED + 1))
    else
        echo "  ERRORE:"
        echo "$OUTPUT" | head -20
        FAILED=$((FAILED + 1))

        # Ask to continue or abort
        if [ $step -lt $TOTAL ]; then
            echo ""
            echo "  Vuoi continuare con le migrazioni successive? (y/n)"
            read -r answer
            if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
                echo "Migrazione interrotta."
                break
            fi
        fi
    fi
    echo ""
done

echo "================================================"
echo "Risultato: $PASSED OK, $FAILED ERRORI su $TOTAL migrazioni"
echo "================================================"

if [ $FAILED -eq 0 ]; then
    echo ""
    echo "Verifica tabelle create..."
    $PSQL "$DB_URL" -c "
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename;
    "
    echo ""
    echo "Verifica enum types..."
    $PSQL "$DB_URL" -c "
        SELECT typname
        FROM pg_type
        WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
          AND typtype = 'e'
        ORDER BY typname;
    "
    echo ""
    echo "Tutte le migrazioni completate con successo!"
fi

exit $FAILED
