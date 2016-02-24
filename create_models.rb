require 'active_support/inflector'
require 'fileutils'
require 'optparse'
require 'pg'

def convert_type(format_type)
  if (format_type =~ /^timestamp/) || (format_type =~ /^date/)
    'DATE'
  elsif format_type =~ /^numeric/
    'FLOAT'
  elsif format_type =~ /boolean/
    'BOOLEAN'
  elsif format_type =~ /^character var/
    'STRING'
  elsif format_type =~ /^text/
    'TEXT'
  elsif (format_type =~ /^integer/) || (format_type =~ /^bigint/)
    'INTEGER'
  end
end

def convert_filename(name)
  if name !~ /_/
    name.capitalize
  else
    name.split('_').map{|e| e.capitalize}.join
  end
end

def create_model_file(model, file_dir, db_conn)
  table_name = model.pluralize
  file_name = file_dir + '/' + convert_filename(model) + '.js'

  puts "model(#{model}), table_name(#{table_name}), file_name(#{file_name})" 

  sql = "SELECT a.attname, format_type(a.atttypid, a.atttypmod), d.adsrc, a.attnotnull " +
    "FROM pg_attribute a LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum " +
    "WHERE a.attrelid = '" + table_name + "'::regclass AND a.attnum > 0 AND NOT a.attisdropped"
  
  
  puts "sql: #{sql}"

  results = db_conn.exec(sql)
  
  puts "execute the sql finished"
  result_size = results.ntuples

  puts "model(#{model}), table_name(#{table_name}), file_name(#{file_name}), result_size(#{result_size})"
  
  ident = ' ' * 4
  skip_fields = ['id', 'created_at', 'updated_at']

  model_file = File.new(file_name, "w+")
  model_file.puts('/**')
  model_file.puts(' * ' + table_name + ' table definition')
  model_file.puts(" */\n\n")
  model_file.puts('module.exports = function (sequelize, DataTypes) {')
  model_file.puts(ident + "return sequelize.define('" + model + "', {")

  count = 2 # skip id, created_at, updated_at fields
  skip_count = 1
  
  lines = []
  results.each do |tuple|  
    next if skip_fields.include? tuple['attname']

    converted_type = convert_type(tuple['format_type'])
    puts "\t\tcount(#{count}), attname(#{tuple['attname']}), format_type(#{tuple['format_type']}), converted_type(#{converted_type})"
    
    line = ident + ident + tuple['attname'] + ':  DataTypes.' + converted_type + ','
 
    lines.push(line) 
  end

  lines.last.chomp!(',')   # chomp , from last line
  lines.each {|line| model_file.puts(line)}
  model_file.puts(ident + '});')
  model_file.puts('};')
  model_file.close
end


options = {}
OptionParser.new do |opts|
  opts.banner = "Usage: create_models.rb -d [database] -h [database host] -m [model name]"

  opts.on("-d", "--database Database", "databas name") do |database|
    options[:database] = database
  end

  opts.on("-h", "--host Database host", "database host name") do |host|
    options[:host] = host
  end

  opts.on("-m", "--model Model name", "model name") do |model|
    options[:model] = model
  end
  
end.parse!

#if options[:model].nil?
#  return
#end

# model: address; table_name: addresses; file_name: Address.js
model = options[:model]

database = options[:database].nil?  ? 'miioon_dev4' : options[:database]
host     = options[:host].nil?      ? '192.168.199.81' : options[:host]

db_conn = PGconn.open(:host => host,
                      :port => 5432,
                      :dbname => database,
                      :user => 'sc_admin',
                      :password => '')


#models = %w(adjustment autoship autoship_item autoship_payment calculator catalog catalog_product 
#            catalog_product_variant continent country countryship creditcard currency distributor gift_card
#            gift_card_payment inventory_unit line_item log_entry order order_batch payment payment_method
#            preference product role roleship shipping_category shipment shipping_method state status
#            state_event taxon user variant)

models = %w(order)

models.each { |m| create_model_file(m, "./models", db_conn) }
puts "Finished....."

