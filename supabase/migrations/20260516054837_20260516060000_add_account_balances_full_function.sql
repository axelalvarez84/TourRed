/*
  # Función get_account_balances_full

  1. Nueva función
    - `get_account_balances_full(p_year, p_month)` — Retorna para cada cuenta activa:
      - `period_balance`: saldo neto del mes/año indicado (solo ese período)
      - `historic_balance`: saldo neto acumulado histórico (todos los períodos confirmados hasta el cierre del mes indicado)
    - Aplica naturaleza deudora/acreedora: deudora = débito - crédito, acreedora = crédito - débito
    - Solo incluye cuentas activas con movimientos (balance != 0 se muestra, las con 0 también para el catálogo)
    - Política de seguridad: SECURITY DEFINER para admin y accountant

  2. Notas
    - El saldo del período solo acumula polizas donde period_year = p_year AND period_month = p_month
    - El saldo histórico acumula TODAS las polizas confirmadas (is_posted = true) hasta ese punto
    - Ambos calculados desde accounting_entry_lines via accounting_entries (is_posted = true)
*/

CREATE OR REPLACE FUNCTION get_account_balances_full(
  p_year integer,
  p_month integer
)
RETURNS TABLE (
  code             text,
  name             text,
  account_type     text,
  nature           text,
  period_debit     numeric,
  period_credit    numeric,
  period_balance   numeric,
  historic_debit   numeric,
  historic_credit  numeric,
  historic_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ca.code,
    ca.name,
    ca.account_type,
    ca.nature,
    -- Period: only the selected month/year
    COALESCE(SUM(CASE WHEN ae.period_year = p_year AND ae.period_month = p_month
                      THEN ael.debit ELSE 0 END), 0)::numeric  AS period_debit,
    COALESCE(SUM(CASE WHEN ae.period_year = p_year AND ae.period_month = p_month
                      THEN ael.credit ELSE 0 END), 0)::numeric AS period_credit,
    CASE ca.nature
      WHEN 'deudora'   THEN COALESCE(SUM(CASE WHEN ae.period_year = p_year AND ae.period_month = p_month THEN ael.debit - ael.credit ELSE 0 END), 0)::numeric
      WHEN 'acreedora' THEN COALESCE(SUM(CASE WHEN ae.period_year = p_year AND ae.period_month = p_month THEN ael.credit - ael.debit ELSE 0 END), 0)::numeric
      ELSE 0::numeric
    END AS period_balance,
    -- Historic: all posted entries up to and including the selected period
    COALESCE(SUM(CASE WHEN (ae.period_year < p_year OR (ae.period_year = p_year AND ae.period_month <= p_month))
                      THEN ael.debit ELSE 0 END), 0)::numeric  AS historic_debit,
    COALESCE(SUM(CASE WHEN (ae.period_year < p_year OR (ae.period_year = p_year AND ae.period_month <= p_month))
                      THEN ael.credit ELSE 0 END), 0)::numeric AS historic_credit,
    CASE ca.nature
      WHEN 'deudora'   THEN COALESCE(SUM(CASE WHEN (ae.period_year < p_year OR (ae.period_year = p_year AND ae.period_month <= p_month)) THEN ael.debit - ael.credit ELSE 0 END), 0)::numeric
      WHEN 'acreedora' THEN COALESCE(SUM(CASE WHEN (ae.period_year < p_year OR (ae.period_year = p_year AND ae.period_month <= p_month)) THEN ael.credit - ael.debit ELSE 0 END), 0)::numeric
      ELSE 0::numeric
    END AS historic_balance
  FROM chart_of_accounts ca
  LEFT JOIN accounting_entry_lines ael ON ael.account_code = ca.code
  LEFT JOIN accounting_entries ae ON ae.id = ael.entry_id AND ae.is_posted = true
  WHERE ca.is_active = true
  GROUP BY ca.code, ca.name, ca.account_type, ca.nature
  ORDER BY ca.code;
END;
$$;

GRANT EXECUTE ON FUNCTION get_account_balances_full(integer, integer) TO authenticated;
