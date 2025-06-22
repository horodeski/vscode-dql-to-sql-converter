export function ChangeSqlToOrm(sql: string): string {
  let ormLines: string[] = [];

  // SELECT
  const selectMatch = sql.match(/SELECT\s+([\s\S]*?)\s+FROM/i);
  if (selectMatch) {
    ormLines.push(`->select('${selectMatch[1].trim()}')`);
  }

  // FROM
  const fromMatch = sql.match(/FROM\s+(\w+)\s+(\w+)/i);
  if (fromMatch) {
    ormLines.push(`->from('${fromMatch[1]}', '${fromMatch[2]}')`);
  }

  // JOINs
  // Captura LEFT, INNER, RIGHT JOINs com ON clause simples
  const joinRegex = /(LEFT|INNER|RIGHT)\s+JOIN\s+(\w+)\s+(\w+)\s+ON\s+([^\s]+)\s*=\s*([^\s]+)/gi;
  let joinMatch;
  while ((joinMatch = joinRegex.exec(sql)) !== null) {
    const joinType = joinMatch[1].toLowerCase();
    const table = joinMatch[2];
    const alias = joinMatch[3];
    const leftSide = joinMatch[4];
    const rightSide = joinMatch[5];

    // Assumindo padrão alias.relationship para ORM
    // Exemplo: o.user_id = u.id vira leftJoin('u.orders', 'o')
    // Vamos extrair o alias pai (ex: 'u') e a relação (ex: 'orders')

    let parentAlias = '';
    let relation = '';

    // Se leftSide = o.user_id, split por '.' e pega alias + relação
    const leftParts = leftSide.split('.');
    if (leftParts.length === 2) {
      const [leftAlias, leftField] = leftParts;
      // O rightSide deve ser algo como u.id
      const rightParts = rightSide.split('.');
      if (rightParts.length === 2) {
        const [rightAlias, rightField] = rightParts;

        // Se rightField é id e leftField termina com _id, o relacionamento é entre rightAlias e leftField sem '_id'
        if (rightField === 'id' && leftField.endsWith('_id')) {
          parentAlias = rightAlias;
          relation = leftField.slice(0, -3); // remove _id
        }
      }
    }

    if (parentAlias && relation) {
      ormLines.push(`->${joinType}Join('${parentAlias}.${relation}', '${alias}')`);
    } else {
      // Caso não consiga inferir, colocar join genérico
      ormLines.push(`->${joinType}Join('${table}', '${alias}')`);
    }
  }

  // WHERE (inclui AND, OR)
  const whereMatch = sql.match(/WHERE\s+([\s\S]*?)(GROUP BY|HAVING|ORDER BY|LIMIT|OFFSET|$)/i);
  if (whereMatch) {
    // Quebra as condições por AND / OR (considerando que AND / OR estejam em maiúsculas)
    const conditions = whereMatch[1].trim().split(/\s+(AND|OR)\s+/i);

    // conditions terá uma lista tipo: ['cond1', 'AND', 'cond2', 'OR', 'cond3', ...]
    // Itera para montar as chamadas ->where, ->andWhere, ->orWhere
    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i].trim();
      if (i === 0) {
        ormLines.push(`->where('${cond}')`);
      } else {
        const op = conditions[i - 1].toUpperCase();
        if (op === 'AND') {
          ormLines.push(`->andWhere('${cond}')`);
        } else if (op === 'OR') {
          ormLines.push(`->orWhere('${cond}')`);
        }
      }
      i++; // pula o operador na próxima iteração
    }
  }

  // GROUP BY
  const groupByMatch = sql.match(/GROUP BY\s+([\s\S]*?)(HAVING|ORDER BY|LIMIT|OFFSET|$)/i);
  if (groupByMatch) {
    ormLines.push(`->groupBy('${groupByMatch[1].trim()}')`);
  }

  // HAVING
  const havingMatch = sql.match(/HAVING\s+([\s\S]*?)(ORDER BY|LIMIT|OFFSET|$)/i);
  if (havingMatch) {
    ormLines.push(`->having('${havingMatch[1].trim()}')`);
  }

  // ORDER BY
  const orderByMatch = sql.match(/ORDER BY\s+([\w\.\,\s]+)\s+(ASC|DESC)/i);
  if (orderByMatch) {
    ormLines.push(`->orderBy('${orderByMatch[1].trim()}', '${orderByMatch[2].toUpperCase()}')`);
  }

  // LIMIT
  const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) {
    ormLines.push(`->setMaxResults(${limitMatch[1]})`);
  }

  // OFFSET
  const offsetMatch = sql.match(/OFFSET\s+(\d+)/i);
  if (offsetMatch) {
    ormLines.push(`->setFirstResult(${offsetMatch[1]})`);
  }

  return '$queryBuilder\n  ' + ormLines.join('\n  ') + ';';
}
