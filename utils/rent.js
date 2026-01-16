// rent recommendation utilities

function suggestedIncreaseForArea(area) {
  if (!area) return 3;
  const demandIndex = Number(area.demandIndex || 0);
  const vacancy = Number(area.vacancyRate || 0);
  return (demandIndex > 7 && vacancy < 5) ? 8 : 3;
}

module.exports = { suggestedIncreaseForArea };
