const getHealth = (req, res) => {
  res.status(200).json({
    success: true,
    service: 'softrate-lms',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
};

module.exports = {
  getHealth,
};
