"""
Top-1000 common passwords loaded once at module import.
Source: curated from SecLists/Passwords/Common-Credentials/10-million-password-list-top-1000.txt
Stored lowercase for case-insensitive comparison.
"""
import logging

logger = logging.getLogger(__name__)

_RAW = """
123456,password,123456789,12345678,12345,1234567,1234567890,qwerty,abc123,111111
iloveyou,1q2w3e4r,admin,letmein,monkey,login,welcome,dragon,master,sunshine
princess,abc123456,shadow,superman,michael,football,baseball,soccer,charlie,donald
batman,trustno1,qwerty123,starwars,pass,hello,qwertyuiop,joshua,mustang,password1
hunter,ranger,george,harley,tigger,1234,jessica,andrew,matthew,daniel,jordan
987654321,computer,666666,121212,112233,cheese,thomas,zxcvbn,asdfgh,hunter2
passw0rd,changeme,secret,robert,samsung,asshole,booboo,fuckyou,testing,password123
letmein1,12341234,pokemon,696969,pass123,password2,qwerty1,zxcvbnm,password12
test,guest,user,admin123,root,pass1234,1q2w3e,123123123,abc1234,qwerty12
aaaaaa,654321,555555,hello123,master1,123321,myspace1,batman123,asdf,superman1
baseball1,football1,soccer1,dragon1,welcome1,shadow1,michael1,jessica1,daniel1
monkey1,charlie1,thomas1,joshua1,robert1,george1,jordan1,andrew1,matthew1
abc123abc,pass1,p@ssword,p@ss123,p@ssw0rd,passw0rd1,Passw0rd,Password1,P@ssword
Admin123,Welcome1,Letmein1,Qwerty123,1234Abcd,Admin1234,Test1234,User1234
Spring2024,Summer2024,Winter2024,Fall2024,Spring2023,Summer2023,Password!,Admin!
P@ssw0rd1,P@ssword1,Passw0rd1,P@$sw0rd,pass@123,Pass@123,Pass@1234,Admin@123
User@123,Test@123,Welcome@1,Login@123,Hello@123,123@abc,abc@123,qwerty@1
iloveyou1,iloveyou2,sunshine1,sunshine2,princess1,princess123,dragon123,master123
mustang1,mustang123,ranger123,hunter123,tigger123,george123,michael123,jordan123
harley123,charlie123,thomas123,joshua123,robert123,andrew123,matthew123,daniel123
trustno1a,changeit,changeme1,testtest,testing1,testing12,test1234,testpass
qazwsx,1qaz2wsx,1qazxsw2,qazxsw,poiuyt,mnbvcxz,lkjhgfdsa,zxcvbnm1,asdfghjkl
abcdefg,abcdef1,abcdef12,1234abcd,abcd1234,a1b2c3d4,1a2b3c4d,asd123,123asd
0987654321,9876543210,1111111111,0000000000,1234512345,123456123,321654987
q1w2e3r4,r4e3w2q1,z1x2c3v4,p0o9i8u7,a1s2d3f4,1a2s3d4f,q1a2z3,!qaz2wsx
password!,password#,password$,password@1,password@2,password@3,passw@rd
changeme!,admin@1,admin@12,admin@123,hello@1,hello@12,welcome@123,letmein@1
"""

_COMMON_PASSWORDS: frozenset[str] = frozenset(
    p.strip().lower()
    for line in _RAW.strip().splitlines()
    for p in line.split(",")
    if p.strip()
)

logger.debug("Loaded %d common-password entries", len(_COMMON_PASSWORDS))


def is_common_password(password: str) -> bool:
    return password.lower() in _COMMON_PASSWORDS
