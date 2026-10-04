app.listen(process.env.PORT || 8080, '0.0.0.0',
  () => console.log('bridge on port ' + (process.env.PORT || 8080)));
